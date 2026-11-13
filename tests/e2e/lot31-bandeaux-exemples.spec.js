// ═══════════════════════════════════════════════════════════════════════════
// LOT-31 (audit UX/UI du 2026-11-10) — BANDEAUX ET CONVERSATIONS D'EXEMPLE
//   ① TRA-C19 : le bandeau de l'équipe ne recouvre plus la barre du haut ; avec
//      le hors-ligne affiché, les deux restent visibles sans se chevaucher.
//   ② TRA-C19 : la reconnexion n'annonce un envoi que s'il y a une file.
//   ③ MSG-C24 : le panneau d'une conversation d'exemple n'a qu'une action.
//   ④ MSG-C24 : pour un compte, les exemples quittent la liste dès qu'une vraie
//      conversation existe.
// La table `reglages_distants` est servie par une route ; aucune écriture réseau.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const REEL = "a1b2c3d4-0000-4000-8000-00000000c4a1";

test("① TRA-C19 : bandeau de l'équipe hors de la barre du haut, empilé avec le hors-ligne", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/reglages_distants\?/, (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ cle: "bandeau", valeur: { texte: "Maintenance ce soir à 22 h", niveau: "info" }, maj: "2026-11-13T10:00:00Z" }]),
  }));
  await page.addInitScript(() => { window.PASSIO_REGLAGES_DISTANTS = true; });
  await bootOnboarded(page);
  await page.evaluate(() => PassioReglages.rafraichir(true));
  const b = page.locator("#passioBandeauDistant");
  await expect(b).toBeVisible();
  const seul = await b.boundingBox();
  expect(seul.y, "loin de la barre du haut").toBeGreaterThan(844 / 2);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.evaluate(() => {
    // Le hors-ligne natif peut ne pas être relayé en headless : on pose l'état
    // tel que `showOffline` le pose.
    const o = document.getElementById("offlineBanner"); o.style.display = "flex";
    document.body.classList.add("passio-hors-ligne");
  });
  const deux = await page.evaluate(() => {
    const a = document.getElementById("passioBandeauDistant").getBoundingClientRect();
    const o = document.getElementById("offlineBanner").getBoundingClientRect();
    return { aBas: a.bottom, oHaut: o.top, oHauteur: o.height, aHaut: a.top };
  });
  expect(deux.oHauteur).toBeGreaterThan(0);
  expect(deux.aBas, "le bandeau de l'équipe est au-dessus du hors-ligne").toBeLessThanOrEqual(deux.oHaut);
  expect(deux.aHaut).toBeGreaterThan(844 / 3);
});

test("② TRA-C19 : pas d'envoi annoncé sans file ; la file est comptée", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(() => {
    const toasts = [];
    window.toast = (t) => toasts.push(String(t));
    window._flushOutbox = () => {};
    localStorage.setItem(OUTBOX_KEY, "[]");
    window.dispatchEvent(new Event("online"));
    const vide = toasts.filter((t) => /Connexion rétablie/.test(t)).length;
    window._fileProprietaire = () => "compte_lot31";
    localStorage.setItem(OUTBOX_KEY, JSON.stringify([
      { convId: "c1", msgId: "m1", content: "a", owner: "compte_lot31" },
      { convId: "c1", msgId: "m2", content: "b", owner: "compte_lot31" },
      { convId: "c2", msgId: "m3", content: "c", owner: "un_autre" },
    ]));
    window.dispatchEvent(new Event("online"));
    localStorage.setItem(OUTBOX_KEY, "[]");
    return { vide, apres: toasts.filter((t) => /Connexion rétablie/.test(t)) };
  });
  expect(r.vide, "file vide : aucun toast d'envoi").toBe(0);
  expect(r.apres).toEqual(["Connexion rétablie — envoi de 2 messages en attente"]);
});

test("③ MSG-C24 : un exemple n'a qu'une action, « Supprimer cet exemple »", async ({ page }) => {
  await bootOnboarded(page);
  const libelles = await page.evaluate(() => {
    const ex = JSON.parse(JSON.stringify(SEED_CONVERSATIONS[0]));
    conversationsState = [ex];
    openConvSettings(ex.id);
    return Array.from(document.querySelectorAll("#convSettingsContent .csetting-label")).map((x) => x.textContent);
  });
  expect(libelles).toEqual(["Supprimer cet exemple"]);
});

test("④ MSG-C24 : une vraie conversation fait partir les exemples de la liste", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate((reel) => {
    window._convNetLoaded = true;
    window._compteAuthReel = () => true;
    const exemples = JSON.parse(JSON.stringify(SEED_CONVERSATIONS));
    conversationsState = exemples.concat([{ id: "c_reel", userId: reel, userName: "Vraie Personne", lastAt: Date.now(), messages: [{ id: "m", from: reel, text: "salut", at: Date.now() }] }]);
    goTo("messages");
    renderMessages();
    const avec = document.querySelectorAll(".msg-card").length;
    conversationsState = JSON.parse(JSON.stringify(SEED_CONVERSATIONS));
    renderMessages();
    const sans = document.querySelectorAll(".msg-card").length;
    return { avec, sans, n: SEED_CONVERSATIONS.length };
  }, REEL);
  expect(r.avec, "seule la vraie conversation reste").toBe(1);
  expect(r.sans, "sans vraie conversation, les exemples restent").toBe(r.n);
});
