// Sonde transverse 03 : la pile de toasts au-dessus (ou au-dessous) de chaque superposition.
// Toast FIGÉ (animation coupée) ; `elementFromPoint` ignore un élément en `pointer-events:none`,
// on lève donc ce réglage le temps de la mesure, sur la pile ET sur le toast.
const base = require("../jeu/base");
module.exports = async ({ page, photo, banc }) => {
  const out = {};
  const mesurer = async (contexte) => page.evaluate((contexte) => {
    const pile = document.getElementById("toastStack");
    pile.innerHTML = "";
    toast("Message de contrôle — " + contexte, "info");
    const t = pile.lastElementChild;
    t.style.animation = "none"; t.style.opacity = "1";
    pile.style.pointerEvents = "auto"; t.style.pointerEvents = "auto";
    const r = t.getBoundingClientRect();
    const sur = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const visible = !!sur && (sur === t || t.contains(sur));
    let couvrant = null;
    if (!visible && sur) { let e = sur; while (e && e !== document.body && !e.id) e = e.parentElement; couvrant = (e && e.id ? "#" + e.id : sur.tagName) + " (z " + getComputedStyle(e || sur).zIndex + ")"; }
    const nav = document.querySelector("#appNavV2:not([hidden]), #appNav");
    const rn = nav ? nav.getBoundingClientRect() : null;
    pile.style.pointerEvents = ""; t.style.pointerEvents = "";
    return { contexte, visible, couvrant, toast: [r.x, r.y, r.width, r.height].map(Math.round), basToast: Math.round(r.bottom), hautBarre: rn ? Math.round(rn.top) : null, vh: innerHeight, zPile: getComputedStyle(pile).zIndex, parentPile: pile.parentElement && (pile.parentElement.id || pile.parentElement.className) };
  }, contexte);
  try {
    await page.waitForTimeout(1500);
    out.fil = await mesurer("fil");
    await photo("fil");
    await page.evaluate(() => openNotifications()); await page.waitForTimeout(700);
    out.modale = await mesurer("modale");
    await photo("modale");
    await page.evaluate(() => { closeModal(); toggleDevPanel(); }); await page.waitForTimeout(400);
    out.panneauReglages = await mesurer("panneau-reglages");
    await page.evaluate(() => toggleDevPanel());
    await page.evaluate(() => goTo("messages")); await page.waitForTimeout(800);
    await page.locator("#messageList [onclick]").first().click().catch(() => {});
    await page.waitForTimeout(1200);
    out.conversation = await mesurer("conversation");
    await page.evaluate(() => { try { closeConversation(); } catch (e) {} goTo("feed"); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { try { openReels(); } catch (e) {} }); await page.waitForTimeout(1500);
    out.bobines = await mesurer("bobines");
    await page.evaluate(() => { try { closeReels(); } catch (e) {} }); await page.waitForTimeout(500);
    await page.evaluate(() => { try { openPost("pa_lea_1"); } catch (e) {} }); await page.waitForTimeout(900);
    out.pagePublication = await mesurer("page-publication");
    await page.evaluate(() => { try { closePost(); } catch (e) {} });
    // Clavier : fenêtre réduite de 300 px (clavier simulé)
    const rendre = await banc.simulerClavier(page, 300);
    out.clavier = await mesurer("clavier");
    await photo("clavier");
    await rendre();
    // Pile : quatre toasts émis d'affilée, dont un très long
    out.pile = await page.evaluate(() => {
      const pile = document.getElementById("toastStack"); pile.innerHTML = "";
      toast("Lien copié"); toast("⚠️ Blocage non enregistré — réessaie"); toast("Ton compte est fermé et tes données supprimées, mais la confirmation finale n'a pas pu être enregistrée. Écris à passioadmin@gmail.com", "warning"); toast("Publication signalée. Merci, on s'en occupe.", "success");
      Array.from(pile.children).forEach((t) => { t.style.animation = "none"; t.style.opacity = "1"; });
      const r = pile.getBoundingClientRect();
      return { nb: pile.children.length, hauteur: Math.round(r.height), haut: Math.round(r.top), largeurs: Array.from(pile.children).map((t) => Math.round(t.getBoundingClientRect().width)), roles: Array.from(pile.children).map((t) => t.getAttribute("role")), ariaLivePile: pile.getAttribute("aria-live") };
    });
    await photo("pile");
  } catch (e) { out.erreur = String(e.stack || e).slice(0, 600); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (s, c) => base.peupler(s, c) };
