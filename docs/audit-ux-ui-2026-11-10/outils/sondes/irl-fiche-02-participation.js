// Sonde irl-fiche 02 : participation, retrait, liste d'attente, refus serveur, hors ligne, double appui.
const jeu = require("../jeu/irl-fiche");
module.exports = async ({ page, context, serveur, photo, GENS, MOI }) => {
  await page.waitForTimeout(2500);
  const out = {};
  const etat = async () => page.evaluate(() => ({
    cta: (document.getElementById("eventDetailCta") || {}).innerText,
    toasts: (window.__toasts || []).slice(-4).map((t) => t.msg),
    modale: (document.querySelector("#modalBackdrop.active .modal-title") || {}).textContent || null,
    notifs: (typeof state !== "undefined" && state.notifications) ? state.notifications.slice(0, 2).map((n) => (n.text || "").slice(0, 60)) : null,
    hash: location.hash,
  }));
  const lignes = (id) => serveur.t.event_attendees.filter((a) => a.event_id === id && a.user_id === MOI.id).map((a) => a.rsvp);
  const ouvrir = async (id) => { await page.evaluate((i) => { try { closeModal(); } catch (e) {} try { closeEventDetail(); } catch (e) {} openEventDetails(i); }, id); await page.waitForTimeout(1200); };

  // 1. Je participe
  await ouvrir("ev_if_avenir");
  await page.locator("[data-v4b-rsvp-go]").click();
  await page.waitForTimeout(300);
  out.apres300 = await etat();
  await page.waitForTimeout(1800);
  out.apres2s = await etat(); out.serveur1 = lignes("ev_if_avenir");
  await photo("1-inscrit");
  // 2. Discussion
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  const disc = page.locator("#eventDetailContent").getByText("Discussion des participants").first();
  await disc.scrollIntoViewIfNeeded(); await disc.click(); await page.waitForTimeout(2000);
  out.discussion = await page.evaluate(() => ({ conv: (document.getElementById("conv-fullpage") || { classList: { contains: () => false } }).classList.contains("active"), titre: ((document.querySelector("#conv-fullpage .conv-fp-name, #conv-fullpage h2, #conv-fullpage .conv-fp-title") || {}).textContent || "").trim(), toasts: (window.__toasts || []).slice(-3).map((t) => t.msg) }));
  await photo("2-discussion");
  // 3. Retirer
  await page.evaluate(() => { try { closeConversation(); } catch (e) {} });
  await ouvrir("ev_if_avenir");
  await page.locator("[data-v4b-rsvp-remove]").click();
  await page.waitForTimeout(1800);
  out.retrait = await etat(); out.serveur3 = lignes("ev_if_avenir");
  await photo("3-retrait");
  // 4. Liste d'attente
  await ouvrir("ev_if_complete");
  await page.locator("[data-v4b-rsvp-go]").click();
  await page.waitForTimeout(1800);
  out.attente = await etat(); out.serveur4 = lignes("ev_if_complete");
  await photo("4-attente");
  // 5. Refus « complète » rejoué : la dernière place est prise ailleurs
  jeu.remplirEnDouce(serveur, "ev_if_presque", GENS.long.id);
  await ouvrir("ev_if_presque");
  await page.locator("[data-v4b-rsvp-go]").click();
  await page.waitForTimeout(300);
  out.refus300 = await etat();
  await page.waitForTimeout(1800);
  out.refus = await etat(); out.serveur5 = lignes("ev_if_presque");
  await photo("5-refus");
  // 6. Hors ligne
  await ouvrir("ev_if_jour");
  await context.setOffline(true);
  await page.locator("[data-v4b-rsvp-go]").click();
  await page.waitForTimeout(400);
  out.horsLigne400 = await etat();
  await page.waitForTimeout(4000);
  out.horsLigne = await etat(); out.serveur6 = lignes("ev_if_jour");
  await photo("6-hors-ligne");
  await context.setOffline(false);
  // 7. Double appui
  await ouvrir("ev_if_payante");
  const b = page.locator("[data-v4b-rsvp-go]");
  await b.dblclick();
  await page.waitForTimeout(2000);
  out.double = await etat(); out.serveur7 = lignes("ev_if_payante");
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => jeu.peupler(s, c) };
