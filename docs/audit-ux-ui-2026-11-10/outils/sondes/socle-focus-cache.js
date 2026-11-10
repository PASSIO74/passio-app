// Commandes TABULABLES mais NON VUES : éléments atteignables au clavier (et lus par un
// lecteur d'écran) alors qu'ils appartiennent à un panneau fermé — hors champ, ou en
// opacité nulle — sans `visibility:hidden`, `display:none`, `inert` ni `aria-hidden`.
module.exports = async ({ page }) => {
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const SEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
    const out = { tabulables: 0, vus: 0, nonVus: 0, parConteneur: {}, exemples: [] };
    document.querySelectorAll(SEL).forEach((el) => {
      // Hors de l'ordre de tabulation : display none / visibility hidden / inert / hidden.
      let n = el, exclu = false, opacite = 1, ariaCache = false;
      while (n && n.nodeType === 1) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden" || n.hasAttribute("inert") || n.hidden) { exclu = true; break; }
        opacite *= Number(cs.opacity);
        if (n.getAttribute("aria-hidden") === "true") ariaCache = true;
        n = n.parentElement;
      }
      if (exclu) return;
      out.tabulables++;
      const r = el.getBoundingClientRect();
      const dansFenetre = r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;   // horizontalement : un panneau glissé hors champ
      const vu = dansFenetre && opacite > 0.05;
      if (vu) { out.vus++; return; }
      out.nonVus++;
      const c = el.closest("#conv-fullpage, #reelsViewer, #reelCommentsPanel, #storyViewer, #modalBackdrop, #devPanel, #landing, #onboarding, #tourOverlay, #passionManager, .screen, nav");
      const cle = (c ? (c.id || String(c.className).split(" ")[0]) : "(autre)") + (ariaCache ? " · aria-hidden" : " · EXPOSÉ aux lecteurs d'écran") + (opacite <= 0.05 ? " · opacité 0" : " · hors champ");
      out.parConteneur[cle] = (out.parConteneur[cle] || 0) + 1;
      if (out.exemples.length < 14) out.exemples.push((el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.tagName).replace(/\s+/g, " ").trim().slice(0, 34) + " → " + cle);
    });
    return out;
  });
};
module.exports.demarrage = { mode: "demo" };
