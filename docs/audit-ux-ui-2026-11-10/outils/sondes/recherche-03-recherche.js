// Recherche — le champ et ses résultats : frappe, attente, passions + personnes,
// aucun résultat, accents / pluriels / fautes, requête longue, Entrée, clavier,
// personne bloquée, retour après navigation.
const jeu = require("../jeu/recherche");
const banc = require("../banc");
const decrire = () => {
  const r = document.getElementById("exploreSearchResults");
  const vis = r && getComputedStyle(r).display !== "none";
  const b = r ? r.getBoundingClientRect() : null;
  return {
    visible: vis, boite: b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null,
    texte: vis ? r.innerText.replace(/\n+/g, " | ").slice(0, 700) : "",
    lignes: vis ? Array.from(r.children).map((c) => { const q = c.getBoundingClientRect(); return Math.round(q.width) + "×" + Math.round(q.height) + " role=" + c.getAttribute("role") + " tab=" + c.getAttribute("tabindex"); }).slice(0, 12) : [],
    valeur: document.getElementById("explorerSearch").value,
  };
};
module.exports = async ({ page, photo, banc: b }) => {
  const out = {};
  const etape = async (nom, fn, att) => { try { await fn(); await page.waitForTimeout(att == null ? 1400 : att); out[nom] = await page.evaluate(decrire); await photo(nom); } catch (e) { out[nom] = "ERREUR " + String(e.message).slice(0, 300); } };
  try {
    await page.locator(".topbar-right > *").first().click();
    await page.waitForTimeout(1500);
    const inp = page.locator("#explorerSearch");
    out.champ = await page.evaluate(() => { const i = document.getElementById("explorerSearch"); const ok = i.parentElement.querySelector("button"); const r = ok.getBoundingClientRect(); return { type: i.type, enterkeyhint: i.getAttribute("enterkeyhint"), inputmode: i.getAttribute("inputmode"), aria: i.getAttribute("aria-label"), label: !!document.querySelector("label[for=explorerSearch]"), fontSize: getComputedStyle(i).fontSize, ok: Math.round(r.width * 10) / 10 + "×" + Math.round(r.height * 10) / 10, okType: ok.type, effacer: !!i.parentElement.querySelector("[aria-label*=ffacer]") }; });
    await etape("01-focus", async () => { await inp.click(); }, 400);
    await etape("02-attente", async () => { await inp.pressSequentially("gui", { delay: 40 }); }, 60);
    await etape("03-gui", async () => {}, 1400);
    await etape("04-guitare", async () => { await inp.fill("guitare"); await inp.dispatchEvent("input"); });
    await etape("05-malik", async () => { await inp.fill("malik"); await inp.dispatchEvent("input"); });
    await etape("06-tom-bloque", async () => { await inp.fill("tom"); await inp.dispatchEvent("input"); });
    await etape("07-aucun", async () => { await inp.fill("zzqxw"); await inp.dispatchEvent("input"); });
    await etape("08-accents", async () => { await inp.fill("theatre"); await inp.dispatchEvent("input"); });
    await etape("09-pluriel", async () => { await inp.fill("guitares"); await inp.dispatchEvent("input"); });
    await etape("10-faute", async () => { await inp.fill("escalde"); await inp.dispatchEvent("input"); });
    await etape("11-majuscules", async () => { await inp.fill("ÉCHECS"); await inp.dispatchEvent("input"); });
    await etape("12-long", async () => { await inp.fill("je cherche des gens pour faire de la guitare électrique le dimanche après-midi à Lyon près de Bellecour"); await inp.dispatchEvent("input"); });
    await etape("13-bio", async () => { await inp.fill("argentique"); await inp.dispatchEvent("input"); });
    await etape("14-entree", async () => { await inp.fill("photo"); await inp.press("Enter"); });
    // clavier : Tab depuis le champ
    out.tab = await page.evaluate(() => null);
    await inp.focus(); const tabs = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press("Tab"); tabs.push(await page.evaluate(() => { const a = document.activeElement; return a.tagName + "#" + a.id + " " + (a.innerText || a.getAttribute("aria-label") || "").slice(0, 30); })); }
    out.tabs = tabs;
    // fermeture : touche Échap, toucher ailleurs
    await inp.focus(); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    out.apresEchap = (await page.evaluate(decrire)).visible;
    await page.mouse.click(200, 700); await page.waitForTimeout(300);
    out.apresToucherAilleurs = (await page.evaluate(decrire)).visible;
    await photo("15-toucher-ailleurs");
    // effacer le champ
    await inp.fill(""); await inp.dispatchEvent("input"); await page.waitForTimeout(400);
    out.vide = (await page.evaluate(decrire)).visible;
    // retour : saisir, aller au fil, revenir
    await inp.fill("escalade"); await inp.dispatchEvent("input"); await page.waitForTimeout(1300);
    await page.evaluate(() => goTo("feed")); await page.waitForTimeout(600);
    await page.locator(".topbar-right > *").first().click(); await page.waitForTimeout(1200);
    out.retour = await page.evaluate(decrire);
    await photo("16-retour");
    // résultat personne → profil → retour arrière
    await inp.fill("malik"); await inp.dispatchEvent("input"); await page.waitForTimeout(1300);
    await page.locator("#exploreSearchResults >> text=Malik Benali").first().click(); await page.waitForTimeout(1500);
    out.profil = await page.evaluate(() => ({ ecran: document.querySelector(".screen.active").id, modale: !!document.querySelector("#modalBackdrop.active"), texte: (document.querySelector("#modalBackdrop.active #modalContent") || document.querySelector(".screen.active")).innerText.slice(0, 300) }));
    await photo("17-profil");
    await page.goBack().catch(() => {}); await page.waitForTimeout(1200);
    out.apresRetour = await page.evaluate(() => ({ ecran: document.querySelector(".screen.active").id, modale: !!document.querySelector("#modalBackdrop.active"), d: document.getElementById("explorerSearch").value, res: getComputedStyle(document.getElementById("exploreSearchResults")).display }));
    await photo("18-apres-retour");
    out.erreurs = await page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  } catch (e) { out.erreur = String(e.message).slice(0, 400); }
  return out;
};
module.exports.demarrage = { mode: "compte", etat: jeu.etat(banc.onboardedState), peupler: (srv, ctx) => jeu.peupler(srv, ctx) };
