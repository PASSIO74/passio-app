// Parcours au clavier du fil : 45 tabulations depuis le haut de la page.
// Pour chaque arrêt : l'élément atteint, s'il est DANS l'écran, s'il est réellement
// VU (opacité effective, panneau fermé), et si un indicateur de focus paraît.
// Sert le constat transverse « des commandes de panneaux fermés restent dans l'ordre de tabulation ».
module.exports = async ({ page }) => {
  await page.waitForTimeout(600);
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.scrollTo(0, 0); });
  const arrets = [];
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press("Tab");
    arrets.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { rien: true };
      const r = el.getBoundingClientRect();
      let o = 1, n = el, cache = null;
      while (n && n.nodeType === 1) {
        const cs = getComputedStyle(n);
        o *= Number(cs.opacity);
        if (!cache && (cs.visibility === "hidden" || cs.display === "none")) cache = n.id || n.className || n.tagName;
        n = n.parentElement;
      }
      const cs = getComputedStyle(el);
      const dansEcran = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      let conteneur = el.closest("#conv-fullpage, #reelsViewer, #storyViewer, #modalBackdrop, #devPanel, #landing, #onboarding, #tourOverlay, .screen");
      return {
        el: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""),
        nom: (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 40),
        dans: conteneur ? (conteneur.id || conteneur.className) : "barres",
        dansEcran, opacite: Math.round(o * 100) / 100, vu: dansEcran && o > 0.05 && !cache,
        indicateur: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none"),
      };
    }));
  }
  const nonVus = arrets.filter((a) => !a.rien && !a.vu);
  const sansIndicateur = arrets.filter((a) => !a.rien && a.vu && !a.indicateur);
  return {
    total: arrets.length,
    nonVus: nonVus.length, sansIndicateur: sansIndicateur.length,
    parConteneur: arrets.reduce((o, a) => { const k = a.rien ? "(aucun)" : a.dans + (a.vu ? "" : " [NON VU]"); o[k] = (o[k] || 0) + 1; return o; }, {}),
    exemplesNonVus: nonVus.slice(0, 12).map((a) => a.el + " « " + a.nom + " » dans " + a.dans + " (opacité " + a.opacite + ", dans l'écran : " + a.dansEcran + ")"),
    exemplesSansIndicateur: sansIndicateur.slice(0, 8).map((a) => a.el + " « " + a.nom + " »"),
    ordre: arrets.map((a) => (a.rien ? "∅" : (a.vu ? "" : "✗ ") + a.nom.slice(0, 22) + " [" + a.dans + "]")),
  };
};
module.exports.demarrage = { mode: "demo" };
