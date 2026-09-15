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
// Hors compte aussi, depuis ASTRA-13 : le FOND d'une modale (`.modal-backdrop`,
// ou tout élément qui contient un `[role="dialog"]`) — une enveloppe qu'on ferme
// en cliquant à côté, pas une commande ; tabulable, il avalait les frappes.
const COMPTER_OUBLIES = () => Array.from(document.querySelectorAll("div[onclick],span[onclick],li[onclick],img[onclick],p[onclick]"))
  .filter((el) => !el.hasAttribute("role") && !el.hasAttribute("tabindex") && !el.classList.contains("nav-item")
    && !el.classList.contains("modal-backdrop") && !el.querySelector('[role="dialog"],[aria-modal="true"]')
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

  // ── ASTRA-13 (contre-revue du 2026-09-15) : la règle FERMAIT UNE MODALE PENDANT
  // LA SAISIE. `#modalBackdrop` porte un `onclick` (fermer au clic dehors) et
  // est VIDE au démarrage : promu `role="button"`. Une modale s'ouvre, on tape
  // Espace dans son textarea → le délégué remonte au fond, `click()`, la modale
  // se ferme et la frappe est avalée. Trois couches, chacune mesurée :
  test("⑤ ASTRA-13 : Espace et Entrée dans un champ d'une modale n'activent rien — la frappe passe, la modale reste", async ({ page }) => {
    await bootOnboarded(page);
    await page.evaluate(() => openModal('<div class="modal-title">Essai</div><textarea id="tx" rows="3"></textarea><input id="ix" type="text"><button id="bx" onclick="window.__bx=(window.__bx||0)+1">OK</button>'));
    await page.waitForTimeout(80);
    await page.focus("#tx");
    await page.keyboard.type("a b");
    await page.keyboard.press("Enter");
    await page.keyboard.type("c");
    await page.focus("#ix");
    await page.keyboard.type("x y");
    const r = await page.evaluate(() => ({
      ouverte: document.getElementById("modalBackdrop").classList.contains("active") || getComputedStyle(document.getElementById("modalBackdrop")).display !== "none",
      tx: document.getElementById("tx") && document.getElementById("tx").value,
      ix: document.getElementById("ix") && document.getElementById("ix").value,
      fond: [document.getElementById("modalBackdrop").getAttribute("role"), document.getElementById("modalBackdrop").getAttribute("tabindex")],
    }));
    // RÉINJECTION : sur le code du 14/09, la modale est fermée au premier Espace,
    // `tx` vaut "a" et le fond porte role="button" tabindex="0".
    expect(r.fond, "le fond d'une modale n'est jamais un bouton").toEqual([null, null]);
    expect(r.tx).toBe("a b\nc");
    expect(r.ix).toBe("x y");
    expect(r.ouverte).toBe(true);
  });

  test("⑤ bis un élément promu bouton quand il était vide redevient conteneur dès qu'une commande y entre", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const p = document.createElement("div"); p.setAttribute("onclick", "window.__p=(window.__p||0)+1"); document.body.appendChild(p);
      return new Promise((res) => setTimeout(() => {
        const avant = [p.getAttribute("role"), p.getAttribute("data-clavier")];
        p.insertAdjacentHTML("beforeend", '<textarea id="tx2"></textarea>');
        setTimeout(() => {
          const apres = [p.getAttribute("role"), p.getAttribute("data-clavier")];
          document.getElementById("tx2").focus();
          const ev = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
          document.getElementById("tx2").dispatchEvent(ev);
          res({ avant, apres, active: window.__p || 0, empeche: ev.defaultPrevented });
        }, 50);
      }, 50));
    });
    expect(r.avant).toEqual(["button", null]);
    // RÉINJECTION : sur le code du 14/09, `apres` reste ["button", null], Espace
    // active le conteneur (active = 1) et la frappe est empêchée.
    expect(r.apres).toEqual([null, "1"]);
    expect(r.active).toBe(0);
    expect(r.empeche).toBe(false);
  });

  test("⑤ ter un vrai bouton non natif s'active toujours à Entrée et Espace, lui", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const b = document.createElement("div"); b.setAttribute("onclick", "window.__b=(window.__b||0)+1"); b.textContent = "Valider"; document.body.appendChild(b);
      return new Promise((res) => setTimeout(() => {
        b.focus();
        for (const key of ["Enter", " "]) b.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        res({ role: b.getAttribute("role"), active: window.__b || 0 });
      }, 50));
    });
    expect(r.role).toBe("button");
    expect(r.active).toBe(2);
  });
});
