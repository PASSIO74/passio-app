// Sonde irl-fiche 04 : modales de la participation et de l'organisation.
const jeu = require("../jeu/irl-fiche");
module.exports = async ({ page, photo }) => {
  await page.waitForTimeout(2500);
  const out = {};
  const ouvre = async (nom, fn, arg) => {
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await page.waitForTimeout(250);
    let err = null;
    try { await page.evaluate(([f, a]) => { const r = window[f] ? window[f](a) : eval(f)(a); return r && r.then ? r.then(() => 1) : 1; }, [fn, arg]); } catch (e) { err = String(e.message).slice(0, 120); }
    await page.waitForTimeout(900);
    out[nom] = err || await page.evaluate(() => {
      const m = document.getElementById("modalContent");
      const act = document.querySelector("#modalBackdrop.active");
      return act && m ? m.innerText.replace(/\s+/g, " ").slice(0, 260) : "(pas de modale) " + ((window.__toasts || []).slice(-1)[0] || {}).msg;
    });
    await photo(nom);
  };
  out.rappels = await page.evaluate(() => { const ev = allEvents().find((e) => e.id === "ev_if_avenir"); return _rappelsVerdict(ev, Date.now()); });
  await page.evaluate(() => openEventDetails("ev_if_avenir"));
  await page.waitForTimeout(1000);
  await ouvre("feuille-rsvp", "openEventRsvpSheet", "ev_if_avenir");
  await ouvre("feuille-rsvp-complete", "openEventRsvpSheet", "ev_if_complete");
  await ouvre("inviter", "openEventInvite", "ev_if_avenir");
  await ouvre("rappels", "(a)=>proposerRappelsActivite(allEvents().find(e=>e.id===a))", "ev_if_avenir");
  await page.evaluate(() => { try { closeModal(); } catch (e) {} localStorage.removeItem("passio_rappels_proposes_v1"); });
  await ouvre("gerer", "openEventManage", "ev_if_mienne");
  await ouvre("coorganisateurs", "openEventCoOrganizers", "ev_if_mienne");
  await ouvre("prevenir", "_messageEventAttendees", "ev_if_mienne");
  await ouvre("qr", "openEventCheckinQr", "ev_if_mienne");
  await ouvre("code-accueil", "openCheckinCodeEntry", "ev_if_live");
  await ouvre("avis", "openEventFeedback", "ev_if_passee");
  await ouvre("creer", "openCreateEvent", undefined);
  out.creerChamps = await page.evaluate(() => Array.from(document.querySelectorAll("#modalContent input, #modalContent select, #modalContent textarea")).filter((e) => e.offsetParent).map((e) => e.id + ":" + e.type + ":" + Math.round(parseFloat(getComputedStyle(e).fontSize)) + "px:" + (e.getAttribute("inputmode") || "")));
  await ouvre("modifier", "openCreateEvent", "ev_if_mienne");
  await ouvre("invitation-apres-creation", "(a)=>proposerInvitationActivite(allEvents().find(e=>e.id===a))", "ev_if_mienne");
  out.affiche = await page.evaluate(() => typeof window.PassioAffiche + " " + Object.keys(window.PassioAffiche || {}).join(","));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => jeu.peupler(s, c) };
