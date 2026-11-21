// Sonde irl-decouvrir 01 — mode démo : écran « Rencontrer », structure et cartes d'exemple.
module.exports = async ({ page, photo }) => {
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(2500);
  await photo("haut");
  const r = await page.evaluate(() => {
    const vis = (el) => !!el && el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
    const ecran = document.getElementById("screen-irl");
    const enfants = [...ecran.children].map((c) => ({ tag: c.tagName, id: c.id, cls: String(c.className).slice(0, 60), vis: vis(c), h: Math.round(c.getBoundingClientRect().height), txt: (c.innerText || "").replace(/\s+/g, " ").slice(0, 120) }));
    const cartes = [...document.querySelectorAll("#eventList .event-card")].slice(0, 6).map((c) => ({ id: c.dataset.evid, v4: c.hasAttribute("data-v4a2"), txt: ((c.querySelector(".v4a2") || c).innerText || "").replace(/\s+/g, " ").slice(0, 200), boutons: [...c.querySelectorAll(".v4a2-actions button, .v4a2-actions span")].map((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { t: b.textContent, w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, col: cs.color, dis: b.disabled }; }) }));
    return {
      nbCartes: document.querySelectorAll("#eventList .event-card").length,
      ref: typeof _irlReferenceLoc === "function" ? _irlReferenceLoc() : null,
      label: typeof _irlReferenceLabel === "function" ? _irlReferenceLabel() : null,
      userLoc: typeof irlUserLocation !== "undefined" ? irlUserLocation : "?",
      firstRun: !!window.PassioFirstRun,
      enfants, cartes,
      plus: (document.querySelector("#eventList > button") || {}).textContent,
    };
  });
  return r;
};
module.exports.demarrage = { mode: "demo" };
