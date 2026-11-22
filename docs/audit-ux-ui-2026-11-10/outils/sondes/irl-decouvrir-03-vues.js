// Sonde irl-decouvrir 03 — démo : « Je viens » sur un exemple, puis vues Carte et Filtre.
module.exports = async ({ page, photo }) => {
  await page.evaluate(() => goTo("irl"));
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__t = []; const t = window.toast; window.toast = function (m) { window.__t.push(String(m)); return t.apply(this, arguments); }; });
  await page.locator("#eventList .v4a2-go").first().click();
  await page.waitForTimeout(800);
  await photo("je-viens");
  const apresViens = await page.evaluate(() => ({ toasts: window.__t.slice(), modale: !!document.querySelector("#modalBackdrop.active, #modalBackdrop.open"), joined: (state.user.joinedEvents || []).slice() }));
  await page.waitForTimeout(3500);
  await page.locator("[data-v4a3-onglet=carte]").click();
  await page.waitForTimeout(6000);
  await photo("carte");
  const carte = await page.evaluate(() => {
    const w = document.getElementById("irlMapWrap"); const r = w.getBoundingClientRect();
    return { wrap: { y: Math.round(r.y), h: Math.round(r.height), cls: w.className }, marqueurs: document.querySelectorAll("#irlMap .maplibregl-marker, #irlMap .irl-marker").length,
      boutons: [...w.querySelectorAll("button, [role=button], a")].map((b) => { const q = b.getBoundingClientRect(); return { t: (b.textContent || b.getAttribute("aria-label") || b.title || "").trim().slice(0, 40), cls: String(b.className).slice(0, 50), w: Math.round(q.width), h: Math.round(q.height) }; }),
      texte: w.innerText.replace(/\s+/g, " ").slice(0, 300), listeVisible: document.getElementById("eventList").getBoundingClientRect().height };
  });
  await page.locator("#v4a3Vue button", { hasText: "Filtre" }).first().click();
  await page.waitForTimeout(1500);
  await photo("filtre");
  const filtre = await page.evaluate(() => {
    const p = document.getElementById("v4a5Panneau");
    return { texte: p ? p.innerText.replace(/\s+/g, " ").slice(0, 900) : null, pied: (document.getElementById("v4a5Pied") || {}).innerText,
      onglets: [...document.querySelectorAll(".v4a3-onglet")].map((o) => o.textContent + ":" + o.getAttribute("aria-selected") + ":" + (o.getAttribute("data-v4a3-onglet") || "")) };
  });
  return { apresViens, carte, filtre };
};
module.exports.demarrage = { mode: "demo" };
