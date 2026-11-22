// Sonde irl-fiche 01 : ouvre chaque activité semée et relève la structure de la fiche.
const jeu = require("../jeu/irl-fiche");
module.exports = async ({ page, photo }) => {
  await page.waitForTimeout(2500);
  const ids = ["ev_if_avenir", "ev_if_jour", "ev_if_complete", "ev_if_passee", "ev_if_annulee", "ev_if_mienne", "ev_if_payante", "ev_if_prive", "ev_if_live", "ev_if_presque"];
  const connus = await page.evaluate(() => allEvents().map((e) => e.id).filter((x) => /^ev_if/.test(x)));
  const out = { connus };
  for (const id of ids) {
    await page.evaluate((i) => { try { closeEventDetail(); } catch (e) {} openEventDetails(i); }, id);
    await page.waitForTimeout(1200);
    out[id] = await page.evaluate(() => {
      const cta = document.getElementById("eventDetailCta");
      const secs = Array.from(document.querySelectorAll("#eventDetailContent [data-v4b-sec]")).map((s) => s.getAttribute("data-v4b-sec") + ":" + s.innerText.replace(/\s+/g, " ").slice(0, 160));
      const r = cta ? cta.getBoundingClientRect() : null;
      return { cta: cta ? cta.innerText.replace(/\s+/g, " ") : null, ctaH: r && Math.round(r.height), secs };
    });
    await photo(id);
  }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => jeu.peupler(s, c) };
