// Recadreur : avatar (menu « Photo de profil »), couverture DEPUIS la modale « Modifier »,
// fichier non-image, puis l'échec d'envoi (panne Storage). Vrais sélecteurs de fichier
// (filechooser Playwright) avec les médias fictifs du banc.
const path = require("path");
const jeu = require("../jeu/profils");
const M = (n) => "/docs/audit-ux-ui-2026-11-10/outils/medias/" + n;
const MED = path.join(__dirname, "..", "medias");
module.exports = async ({ page, photo, serveur }) => {
  const out = {};
  const plan = () => page.evaluate(() => {
    const ov = document.querySelector(".passio-cropper-ov");
    const bd = document.getElementById("modalBackdrop");
    const r = ov ? ov.getBoundingClientRect() : null;
    const centre = ov ? document.elementFromPoint(r.width / 2, r.height / 2) : null;
    return { recadreur: !!ov, zRecadreur: ov ? getComputedStyle(ov).zIndex : null, modaleActive: !!(bd && bd.classList.contains("active")), zModale: bd ? getComputedStyle(bd).zIndex : null, auCentre: centre ? (centre.id || centre.className || centre.tagName) : null };
  });
  try {
    await page.evaluate(() => goTo("profiles"));
    await jeu.absolutiser(page);
    await page.waitForTimeout(1500);
    // 1) avatar par le menu
    await page.locator("#v6bModifier").click(); await page.waitForTimeout(300);
    let fc = page.waitForEvent("filechooser");
    await page.locator("#profileDotsMenu >> text=Photo de profil").click();
    (await fc).setFiles(path.join(MED, "photo-portrait.jpg"));
    await page.waitForTimeout(1500);
    out.avatar = await plan();
    out.boutons = await page.evaluate(() => Array.from(document.querySelectorAll(".passio-cropper-ov button, .passio-cropper-ov input")).map((b) => { const r = b.getBoundingClientRect(); return (b.innerText || b.type) + " " + Math.round(r.width) + "×" + Math.round(r.height); }));
    await photo("1-recadreur-avatar");
    await page.locator("#pcropOk").click(); await page.waitForTimeout(1500);
    out.apresAvatar = await page.evaluate(() => ({ toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), photo: String(state.user.general.avatarPhoto || "").slice(0, 40) }));
    await photo("2-apres-avatar");
    // 2) couverture depuis la modale « Modifier »
    await page.locator("#v6bModifier").click(); await page.waitForTimeout(300);
    await page.locator("#profileDotsMenu >> text=Modifier le profil").click(); await page.waitForTimeout(700);
    await page.locator("#editBio").fill("Bio en cours de saisie, non enregistrée.");
    fc = page.waitForEvent("filechooser");
    await page.locator("#modalContent button:has-text('Changer')").click();
    (await fc).setFiles(path.join(MED, "photo-paysage.jpg"));
    await page.waitForTimeout(1500);
    out.couvertureDepuisModale = await plan();
    await photo("3-recadreur-couverture");
    await page.waitForTimeout(300);
    out.apresAnnulation = await page.evaluate(() => ({ modale: !!document.querySelector("#modalBackdrop.active"), bio: (document.getElementById("editBio") || {}).value || null }));
    await photo("4-apres-annulation");
    await page.evaluate(() => closeModal()); await page.waitForTimeout(600);
    out.apresFermetureModale = await plan();
    await photo("4b-recadreur-reapparu");
    await page.locator("#pcropCancel").click(); await page.waitForTimeout(900);
    out.apresAnnulation2 = await page.evaluate(() => ({ modale: !!document.querySelector("#modalBackdrop.active"), bio: (document.getElementById("editBio") || {}).value || null }));
    await page.evaluate(() => closeModal()); await page.waitForTimeout(500);
    // 3) fichier non-image (une vidéo)
    await page.locator("#v6bModifier").click(); await page.waitForTimeout(300);
    fc = page.waitForEvent("filechooser");
    await page.locator("#profileDotsMenu >> text=Photo de couverture").click();
    (await fc).setFiles(path.join(MED, "boucle.webm"));
    await page.waitForTimeout(1500);
    out.nonImage = Object.assign(await plan(), { toasts: await page.evaluate(() => (window.__toasts || []).map((t) => t.msg).slice(-2)) });
    await photo("5-non-image");
    // 4) panne d'envoi (Storage refusé) puis avatar
    serveur.pannes.push({ table: null, methode: "POST", status: 500, body: { message: "panne simulée" }, fois: 3 });
    await page.locator("#v6bModifier").click(); await page.waitForTimeout(300);
    fc = page.waitForEvent("filechooser");
    await page.locator("#profileDotsMenu >> text=Photo de profil").click();
    (await fc).setFiles(path.join(MED, "avatar-3.jpg"));
    await page.waitForTimeout(1200);
    await page.locator("#pcropOk").click(); await page.waitForTimeout(2500);
    out.panne = await page.evaluate(() => ({ toasts: (window.__toasts || []).map((t) => t.msg).slice(-3), photo: String(state.user.general.avatarPhoto || "").slice(0, 30) }));
    out.journalStorage = serveur.journal.filter((j) => /storage|upload/i.test(j.url || "") || j.m === "POST").slice(-5).map((j) => j.m + " " + (j.url || j.table) + " → " + (j.status || j.reponse || ""));
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(M, { passions: 2 }), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
