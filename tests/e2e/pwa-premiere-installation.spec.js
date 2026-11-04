// ═══════════════════════════════════════════════════════════════════════════
// PWA — UNE PREMIÈRE INSTALLATION N'EST PAS UNE MISE À JOUR  (UXO-11, 2026-11-04)
//
// Relevé par l'audit de septembre, remesuré en production le 2026-11-04 : sur un
// navigateur vierge, « ✨ Mise à jour disponible — recharge pour l'appliquer »
// s'affichait 0,85 s après l'ouverture. Le worker postait `SW_UPDATED` à CHAQUE
// `activate`, installation initiale comprise, et app-09 en faisait un toast.
//
// Ces cas font tourner le VRAI worker dans un contexte vierge : `activate`,
// `clients.claim` et le Cache Storage sont des faits du navigateur, qu'un faux
// conteneur (pwa-maj-silencieuse.spec.js) ne mesurerait pas.
//
// ⚠️ LA SONDE EST POSÉE AVANT TOUT SCRIPT, ET ELLE COMPTE LES TOASTS AU VOL : un
// toast vit 3 s et `bootVisiteur` en attend 3,2. Lire l'écran à la fin serait
// vert même sur le code défectueux.
// ⚠️ ② EST LE TÉMOIN DE ①. Sans lui, une sonde cassée ou un message qui ne part
// plus jamais rendraient ① vert : ② prouve, avec la même sonde, que le message et
// le toast existent toujours quand ils sont vrais.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

test.use({ serviceWorkers: "allow" });

const TOAST_MAJ = "✨ Mise à jour disponible — recharge pour l'appliquer";

// `cachePreexistant` : un cache déjà là quand le worker s'installera. L'ouverture
// part en tête de document, bien avant `load` — le moment où pwa-detect enregistre
// le worker.
async function poserSonde(page, cachePreexistant) {
  await page.addInitScript((cache) => {
    const sonde = {
      controleurAuDepart: !!navigator.serviceWorker.controller,
      messages: [],
      toasts: [],
    };
    window.__sondeSw = sonde;
    navigator.serviceWorker.addEventListener("message", (e) => {
      sonde.messages.push(e.data && e.data.type);
    });
    new MutationObserver((lots) => {
      for (const lot of lots) {
        for (const n of lot.addedNodes) {
          if (n.classList && n.classList.contains("toast")) sonde.toasts.push(n.textContent);
        }
      }
    }).observe(document, { childList: true, subtree: true });
    if (cache) caches.open(cache);
  }, cachePreexistant || null);
}

// Rend les caches une fois le worker aux commandes. Prémisse VÉRIFIÉE : sans
// worker actif, l'absence de message ne prouverait rien.
// ⚠️ `polling` numérique : `raf` ne se déclenche pas sur une page non composée.
async function workerAuxCommandes(page) {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { polling: 50, timeout: 20000 });
  return page.evaluate(() => caches.keys());
}

// Le message suit `clients.claim()` de quelques millisecondes : on lui laisse le
// temps d'arriver avant de conclure à son absence.
async function sondeApresActivation(page) {
  await page.waitForTimeout(1000);
  return page.evaluate(() => window.__sondeSw);
}

test.describe("PWA — première installation et mise à jour", () => {
  test("① appareil vierge : le worker prend la main sans annoncer de mise à jour", async ({ page }) => {
    await poserSonde(page);
    await bootVisiteur(page);
    const cles = await workerAuxCommandes(page);
    const sonde = await sondeApresActivation(page);

    // Prémisses : personne ne contrôlait la page, et le worker a bien installé son cache.
    expect(sonde.controleurAuDepart).toBe(false);
    expect(cles.some((k) => k.startsWith("passio-v"))).toBe(true);

    expect(sonde.messages).not.toContain("SW_UPDATED");
    expect(sonde.toasts).not.toContain(TOAST_MAJ);
  });

  test("② une version précédente a tourné ici : le message part et le toast le dit, sans recharger", async ({ page }) => {
    await poserSonde(page, "passio-vANCIENNE");
    await bootVisiteur(page);
    const cles = await workerAuxCommandes(page);

    await expect.poll(() => page.evaluate(() => window.__sondeSw.messages), { timeout: 5000 }).toContain("SW_UPDATED");
    await expect.poll(() => page.evaluate(() => window.__sondeSw.toasts), { timeout: 5000 }).toContain(TOAST_MAJ);
    expect(cles).not.toContain("passio-vANCIENNE");

    // Page ouverte sans contrôleur : elle ne recharge pas d'elle-même, d'où le toast.
    const navigation = await page.evaluate(() => performance.getEntriesByType("navigation")[0].type);
    expect(navigation).toBe("navigate");
  });

  test("③ le cache du centre de pilotage n'est pas une version de l'application", async ({ page }) => {
    await poserSonde(page, "passio-pilotage-v4");
    await bootVisiteur(page);
    await workerAuxCommandes(page);
    const sonde = await sondeApresActivation(page);

    expect(sonde.controleurAuDepart).toBe(false);
    expect(sonde.messages).not.toContain("SW_UPDATED");
    expect(sonde.toasts).not.toContain(TOAST_MAJ);
  });
});
