// ═══════════════════════════════════════════════════════════════════════════
// GRAND ÉCRAN — disposition pleine page (2026-11-14, demande de Benjamin :
// « pour l'utilisation sur ordinateur, fais en sorte que cela ressemble à un
// vrai site qui prend toute la page »). Remplace la colonne de 640 px du LOT-51
// (audit UX/UI du 2026-11-10, SOC-C03).
//   ① 1440 × 900 : la coque occupe toute la fenêtre, l'en-tête court sur toute
//      la largeur, la navigation est un menu latéral à gauche (libellés
//      visibles, cliquable), le contenu est à sa droite, rien ne déborde ;
//   ② 1024 × 768 : même disposition (le seuil) ; 390 × 844 et 1000 × 768 :
//      rien ne change (colonne de téléphone, barre en bas) ;
//   ③ le menu latéral navigue, et referme la conversation ouverte à côté ;
//   ④ une fiche de publication reste sous l'en-tête, à droite du menu ;
//   ⑤ une fenêtre est un dialogue centré, plus une feuille collée en bas.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function mesure(page) {
  return page.evaluate(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { g: Math.round(r.left), h: Math.round(r.top), d: Math.round(r.right), b: Math.round(r.bottom), l: Math.round(r.width) }; };
    const nav = document.getElementById("appNavV2");
    const n = nav.getBoundingClientRect();
    const centre = document.elementFromPoint(n.left + n.width / 2, n.top + 40);
    const libelle = nav.querySelector(".nav-label");
    return {
      fenetre: { l: window.innerWidth, h: window.innerHeight },
      coque: rect(document.querySelector(".app-shell")),
      tete: rect(document.querySelector(".app-topbar")),
      nav: rect(nav),
      contenu: rect(document.getElementById("appMain")),
      ecran: rect(document.querySelector(".screen.active")),
      debord: document.documentElement.scrollWidth > window.innerWidth + 1,
      navTouchable: !!(centre && nav.contains(centre)),
      libelleVisible: !!(libelle && libelle.getBoundingClientRect().width > 0),
    };
  });
}

// Une conversation réelle (pas un exemple), semée localement : aucune écriture en base.
async function ouvrirConversation(page) {
  await page.evaluate(() => {
    const convs = getConversations();
    if (!convs.some((c) => c.id === "c_pc")) {
      convs.push({ id: "c_pc", userId: "11111111-2222-4333-8444-555555555555", userName: "Camille", userEmoji: "🎨", userColor: "#7c3aed", unread: 0,
        messages: [{ id: "m1", from: "11111111-2222-4333-8444-555555555555", text: "Salut, tu viens dimanche ?", at: Date.now() - 3600000 }] });
      saveConversationsNow();
    }
    goTo("messages"); renderMessages(); openConversation("c_pc");
  });
  await expect(page.locator("#conv-fullpage")).toHaveClass(/active/);
}

function attendPleinePage(r) {
  // La coque : toute la fenêtre.
  expect(r.coque.g).toBe(0);
  expect(r.coque.l).toBe(r.fenetre.l);
  expect(r.coque.b).toBe(r.fenetre.h);
  // L'en-tête : toute la largeur, en haut.
  expect(r.tete.h).toBe(0);
  expect(r.tete.l).toBe(r.fenetre.l);
  // Le menu : à gauche, sous l'en-tête, jusqu'en bas.
  expect(r.nav.g).toBe(0);
  expect(r.nav.h).toBe(r.tete.b);
  expect(r.nav.b).toBe(r.fenetre.h);
  expect(r.nav.l).toBeGreaterThanOrEqual(200);
  expect(r.nav.l).toBeLessThanOrEqual(300);
  expect(r.navTouchable).toBe(true);
  expect(r.libelleVisible).toBe(true);
  // Le contenu : à droite du menu, jusqu'au bord ; l'écran y garde une largeur de lecture.
  expect(r.contenu.g).toBe(r.nav.d);
  expect(r.contenu.d).toBe(r.fenetre.l);
  expect(r.ecran.g).toBeGreaterThanOrEqual(r.nav.d);
  expect(r.ecran.l).toBeLessThanOrEqual(1080);
  expect(r.debord).toBe(false);
}

test("① 1440 × 900 : toute la fenêtre, en-tête pleine largeur, menu latéral, contenu à droite", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootOnboarded(page);
  attendPleinePage(await mesure(page));
});

test("② le seuil : pleine page à 1024 px, colonne de téléphone en dessous", async ({ page }) => {
  await bootOnboarded(page);
  const tel = await mesure(page);
  expect(tel.coque.l).toBeLessThanOrEqual(540);
  expect(tel.nav.b).toBe(tel.fenetre.h);          // la barre reste en bas
  expect(tel.nav.l).toBe(tel.coque.l);            // et sur toute la largeur de la colonne
  expect(tel.nav.h).toBeGreaterThan(tel.contenu.h);

  await page.setViewportSize({ width: 1000, height: 768 });
  await page.waitForTimeout(200);
  const tablette = await mesure(page);
  expect(tablette.coque.l).toBe(440);
  expect(tablette.nav.l).toBe(440);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  attendPleinePage(await mesure(page));
});

test("③ le menu latéral navigue et referme la conversation ouverte à côté", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootOnboarded(page);
  await page.click('#appNavV2 [data-screen="messages"]');
  await expect(page.locator("#screen-messages")).toHaveClass(/active/);
  await ouvrirConversation(page);
  // Le panneau glisse 280 ms : on mesure une fois posé.
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("conv-fullpage").getBoundingClientRect().right))).toBe(1440);
  // La conversation occupe la zone de contenu : le menu reste visible et cliquable.
  const geo = await page.evaluate(() => {
    const c = document.getElementById("conv-fullpage").getBoundingClientRect();
    const n = document.getElementById("appNavV2").getBoundingClientRect();
    const t = document.querySelector(".app-topbar").getBoundingClientRect();
    return { convGauche: Math.round(c.left), convHaut: Math.round(c.top), navDroite: Math.round(n.right), teteBas: Math.round(t.bottom) };
  });
  expect(geo.convGauche).toBe(geo.navDroite);
  expect(geo.convHaut).toBe(geo.teteBas);
  await page.click('#appNavV2 [data-screen="feed"]');
  await expect(page.locator("#screen-feed")).toHaveClass(/active/);
  await expect(page.locator("#conv-fullpage")).not.toHaveClass(/active/);
  expect(await page.evaluate(() => window._openedConvId)).toBeNull();
});

test("③ bis : sur téléphone, changer d'écran ne referme PAS la conversation (rien ne change)", async ({ page }) => {
  await bootOnboarded(page);
  await ouvrirConversation(page);
  await page.evaluate(() => goTo("feed"));
  await expect(page.locator("#conv-fullpage")).toHaveClass(/active/);
});

test("④ la fiche d'une publication s'ouvre sous l'en-tête, à droite du menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootOnboarded(page);
  await page.evaluate(() => {
    const p = document.getElementById("postDetailPage");
    p.style.display = "flex";
  });
  // La page entre par `fadeIn` (6 px de translation, 200 ms) : on mesure une fois posée.
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("postDetailPage").getBoundingClientRect().top))).toBe(64);
  const geo = await page.evaluate(() => {
    const p = document.getElementById("postDetailPage").getBoundingClientRect();
    const n = document.getElementById("appNavV2").getBoundingClientRect();
    const t = document.querySelector(".app-topbar").getBoundingClientRect();
    return { g: Math.round(p.left), h: Math.round(p.top), d: Math.round(p.right), b: Math.round(p.bottom), navDroite: Math.round(n.right), teteBas: Math.round(t.bottom), l: window.innerWidth, ht: window.innerHeight };
  });
  expect(geo.g).toBe(geo.navDroite);
  expect(geo.h).toBe(geo.teteBas);
  expect(geo.d).toBe(geo.l);
  expect(geo.b).toBe(geo.ht);
});

test("⑤ une fenêtre est un dialogue centré", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootOnboarded(page);
  await page.evaluate(() => openNotifications());
  await expect(page.locator("#modalBackdrop")).toHaveClass(/active/);
  const geo = await page.evaluate(() => {
    const m = document.querySelector("#modalBackdrop .modal").getBoundingClientRect();
    return { g: Math.round(m.left), d: Math.round(window.innerWidth - m.right), l: Math.round(m.width), b: Math.round(m.bottom), ht: window.innerHeight };
  });
  expect(geo.l).toBeLessThanOrEqual(560);
  expect(Math.abs(geo.g - geo.d)).toBeLessThanOrEqual(2);
  expect(geo.b).toBeLessThan(geo.ht);             // plus collée au bas de l'écran
});
