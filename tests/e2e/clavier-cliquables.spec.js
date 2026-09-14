// DEV-02 (contre-revue Astra, 2026-09-15) — tout ce qui se clique se tabule.
//
// LE DÉFAUT : ~95 gabarits `<div onclick>` (cartes du fil, rencontres,
// conversations, stories, réglages) sans `tabindex` ni `role` : inaccessibles
// au clavier, muets pour un lecteur d'écran. LA CORRECTION : une règle
// mécanique dans app-08 — tout élément non natif porteur d'un `onclick`
// reçoit `role="button"` et `tabindex="0"`, au démarrage et à chaque nœud
// ajouté — et le délégué clavier existant les active à Entrée/Espace.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Un `<div onclick>` non natif, sans rôle ni tabindex, hors nav-item et hors
// enveloppe stopPropagation : c'est exactement ce qui doit valoir zéro. Un
// conteneur qui porte des commandes reçoit `tabindex` + `data-clavier`, pas
// `role="button"` (ARIA : un bouton ne contient pas d'élément interactif).
const COMPTER_OUBLIES = () => Array.from(document.querySelectorAll("div[onclick],span[onclick],li[onclick],img[onclick],p[onclick]"))
  .filter((el) => !el.hasAttribute("role") && !el.hasAttribute("tabindex") && !el.classList.contains("nav-item")
    && !/^\s*event\.stopPropagation\(\)\s*;?\s*$/.test(el.getAttribute("onclick") || "")).length;

test.describe("clavier — tout élément cliquable est tabulable", () => {
  test("① au démarrage sur le fil, aucun <div onclick> n'est oublié", async ({ page }) => {
    await bootOnboarded(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(COMPTER_OUBLIES)).toBe(0);
    // et il y en avait bien à traiter : la règle ne passe pas sur du vide
    const traites = await page.evaluate(() => ({
      feuilles: document.querySelectorAll('div[onclick][role="button"][tabindex="0"]').length,
      conteneurs: document.querySelectorAll('div[onclick][data-clavier][tabindex="0"]:not([role])').length,
    }));
    expect(traites.feuilles).toBeGreaterThan(5);
    expect(traites.conteneurs).toBeGreaterThan(0);
  });

  test("② les écrans peints ensuite (Rencontrer, Messages, Profil) le sont aussi", async ({ page }) => {
    await bootOnboarded(page);
    for (const ecran of ["irl", "messages", "profiles", "explore", "feed"]) {
      await page.evaluate((e) => goTo(e), ecran);
      await page.waitForTimeout(250);
      expect(await page.evaluate(COMPTER_OUBLIES), ecran).toBe(0);
    }
  });

  test("③ un nœud ajouté après coup est rendu tabulable, et Entrée l'active", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      window.__dev02 = 0;
      const d = document.createElement("div");
      d.id = "dev02Cible"; d.textContent = "carte tardive";
      d.setAttribute("onclick", "window.__dev02++");
      document.body.appendChild(d);
    });
    await page.waitForTimeout(50);
    const attrs = await page.evaluate(() => { const d = document.getElementById("dev02Cible"); return { role: d.getAttribute("role"), tab: d.getAttribute("tabindex") }; });
    expect(attrs).toEqual({ role: "button", tab: "0" });
    await page.focus("#dev02Cible");
    await page.keyboard.press("Enter");
    await page.keyboard.press(" ");
    expect(await page.evaluate(() => window.__dev02)).toBe(2);
  });

  test("③ bis un conteneur qui porte un bouton devient tabulable sans devenir un bouton, et Entrée sur le bouton intérieur n'active pas le conteneur", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => {
      window.__c = 0; window.__b = 0;
      const c = document.createElement("div"); c.id = "dev02Cont"; c.setAttribute("onclick", "window.__c++");
      c.innerHTML = '<span>carte</span><button id="dev02Btn" onclick="event.stopPropagation();window.__b++">Aimer</button>';
      document.body.appendChild(c);
    });
    await page.waitForTimeout(50);
    const a = await page.evaluate(() => { const c = document.getElementById("dev02Cont"); return { role: c.getAttribute("role"), tab: c.getAttribute("tabindex"), clavier: c.getAttribute("data-clavier") }; });
    expect(a).toEqual({ role: null, tab: "0", clavier: "1" });
    await page.focus("#dev02Btn"); await page.keyboard.press("Enter");
    await page.focus("#dev02Cont"); await page.keyboard.press("Enter");
    expect(await page.evaluate(() => [window.__b, window.__c])).toEqual([1, 1]);
  });

  test("④ ce qui n'est PAS une commande reste hors de portée : enveloppe stopPropagation, natifs, rôle déjà posé", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const mk = (tag, onclick, extra) => { const e = document.createElement(tag); e.setAttribute("onclick", onclick); Object.entries(extra || {}).forEach(([k, v]) => e.setAttribute(k, v)); document.body.appendChild(e); return e; };
      const env = mk("div", "event.stopPropagation()");
      const btn = mk("button", "window.__x=1");
      const deja = mk("div", "window.__x=1", { role: "listitem", tabindex: "-1" });
      return new Promise((res) => setTimeout(() => res({
        env: [env.getAttribute("role"), env.getAttribute("tabindex")],
        btn: [btn.getAttribute("role"), btn.getAttribute("tabindex")],
        deja: [deja.getAttribute("role"), deja.getAttribute("tabindex")],
      }), 50));
    });
    expect(r.env).toEqual([null, null]);
    expect(r.btn).toEqual([null, null]);
    expect(r.deja).toEqual(["listitem", "-1"]);
  });
});
