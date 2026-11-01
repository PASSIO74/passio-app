// ══════════════════════════════════════════════════════════════════════════
// L'AFFICHE DE LA RENCONTRE  (2026-11-01 — lancement gratuit, phase 1)
//
// L'organisateur obtient une image A4 avec un QR code qui ouvre sa rencontre,
// pour l'imprimer dans un lieu ou l'envoyer dans ses groupes
// (`js/affiche-rencontre.js`, `docs/PLAN_MONETISATION_2026-11-01.md`).
//
// Ce que cette suite exige :
//   ① le bouton est là pour l'organisateur, à côté du QR d'accueil — et nulle
//      part pour un participant ;
//   ② l'affiche est une VRAIE image A4, et son QR porte le lien de la
//      rencontre, suivi (`?plk=`), dans les 106 octets du générateur ;
//   ③ le QR dessiné se RELIT : on le redécode depuis l'image produite ;
//   ④ un titre hostile ne sort jamais dans le DOM, et un titre trop long tient
//      dans le cadre (trois lignes au plus, terminées par « … ») ;
//   ⑤ kill switch : coupé, aucun bouton — la fiche redevient celle d'avant.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const UID_MOI = "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31";

async function banc(page, { coupe = false, titre = "Rando du dimanche au Semnoz" } = {}) {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.addInitScript(([u, c]) => {
    localStorage.setItem("passio_uid", u);
    if (c) localStorage.setItem("passio_affiche_rencontre", "0");
  }, [UID_MOI, coupe]);
  await bootOnboarded(page, null, 1, { sansIsolationDesDonnees: true });
  await page.evaluate((t) => {
    window.__toasts = []; window.toast = (x) => window.__toasts.push(String(x));
    const dans3j = Date.now() + 3 * 86400000;
    state.seed.events = [
      { id: "ev_mienne", title: t, passion: "musique", emoji: "🎸", city: "Annecy", venue: "Le Bistrot",
        lat: 45.9, lng: 6.12, date: dans3j, time: "10:00", desc: "", price: 0, maxAttendees: 12,
        attendees: [MY_UID], maybes: [], waitlist: [], checkedIn: [], organizerId: MY_UID,
        status: "active", fromSupabase: true },
      { id: "ev_autre", title: "Soirée jeux", passion: "musique", emoji: "🎲", city: "Annecy",
        lat: 45.9, lng: 6.12, date: dans3j, time: "20:00", desc: "", attendees: [], maybes: [],
        waitlist: [], checkedIn: [], organizerId: "u_orga", status: "active", fromSupabase: true },
    ];
    renderIRL();
  }, titre);
}

async function ouvrirFiche(page, id) {
  await page.evaluate((evId) => openEventDetails(evId), id);
  await page.waitForTimeout(500);
}

test("① l'organisateur a son bouton à côté du QR d'accueil, le participant non", async ({ page }) => {
  await banc(page);
  await ouvrirFiche(page, "ev_mienne");
  const mienne = await page.evaluate(() => {
    const qr = document.querySelector('#eventDetailContent [data-orga-qr="ev_mienne"]');
    const b = document.querySelector('#eventDetailContent [data-affiche-rencontre="ev_mienne"]');
    return { qr: !!qr, bouton: !!b, voisin: !!(qr && qr.nextElementSibling === b), visible: !!(b && b.offsetParent) };
  });
  expect(mienne.qr, "la fiche ne porte plus le repère du QR d'accueil").toBe(true);
  expect(mienne.bouton, "aucun bouton d'affiche pour l'organisateur").toBe(true);
  expect(mienne.voisin, "le bouton n'est pas posé juste après le QR d'accueil").toBe(true);
  expect(mienne.visible).toBe(true);

  // Repeinte de la fiche (innerHTML) : le bouton revient, sans doublon.
  await ouvrirFiche(page, "ev_mienne");
  expect(await page.locator("#eventDetailContent [data-affiche-rencontre]").count()).toBe(1);

  await ouvrirFiche(page, "ev_autre");
  expect(await page.locator("#eventDetailContent [data-affiche-rencontre]").count(),
    "un participant peut fabriquer l'affiche d'une rencontre qui n'est pas la sienne").toBe(0);
  const refus = await page.evaluate(() => PassioAffiche.ouvrir("ev_autre"));
  expect(refus, "la porte globale accepte une rencontre d'autrui").toBe(false);
});

test("② l'affiche est une image A4 dont le QR porte le lien suivi de la rencontre", async ({ page }) => {
  await banc(page);
  await ouvrirFiche(page, "ev_mienne");
  await page.locator('[data-affiche-rencontre="ev_mienne"]').click();
  const img = page.locator("#afficheApercu");
  await expect(img).toBeVisible();
  const dims = await img.evaluate(async (el) => {
    if (!el.complete) await new Promise((r) => { el.onload = r; el.onerror = r; });
    return { w: el.naturalWidth, h: el.naturalHeight, src: el.getAttribute("src") };
  });
  expect(dims.w).toBe(1240);
  expect(dims.h).toBe(1754);
  expect(dims.src.startsWith("blob:"), "l'aperçu n'est pas l'image produite").toBe(true);
  await expect(page.locator("#afficheBtnEnregistrer")).toHaveAttribute("download", /^affiche-passio-rando-du-dimanche/);

  const lien = await page.evaluate(() => PassioAffiche._lien("ev_mienne"));
  expect(lien.url, "le QR ne mène pas à la rencontre").toMatch(/(\/e\/ev_mienne|#irl-event-ev_mienne)/);
  expect(lien.url, "le QR n'est pas suivi par le pilotage").toMatch(/[?&]plk=lk_[A-Za-z0-9]+/);
  expect(new TextEncoder().encode(lien.url).length, "le lien dépasse ce que le QR sait porter").toBeLessThanOrEqual(106);
  expect(lien.base, "le lien écrit en clair porte un suivi").not.toMatch(/plk=/);
});

test("③ le QR dessiné sur l'affiche se relit", async ({ page }) => {
  await banc(page);
  await ouvrirFiche(page, "ev_mienne");
  await page.locator('[data-affiche-rencontre="ev_mienne"]').click();
  await expect(page.locator("#afficheApercu")).toBeVisible();
  const lu = await page.evaluate(async () => {
    if (!("BarcodeDetector" in window)) return { absent: true };
    const el = document.getElementById("afficheApercu");
    if (!el.complete) await new Promise((r) => { el.onload = r; });
    const codes = await new BarcodeDetector({ formats: ["qr_code"] }).detect(el);
    return { absent: false, valeurs: codes.map((c) => c.rawValue) };
  });
  test.skip(lu.absent, "BarcodeDetector indisponible dans ce navigateur");
  expect(lu.valeurs.length, "aucun QR lisible sur l'affiche").toBeGreaterThan(0);
  expect(lu.valeurs[0]).toMatch(/(\/e\/ev_mienne|#irl-event-ev_mienne)/);
});

test("④ un titre hostile reste hors du DOM, un titre trop long tient dans le cadre", async ({ page }) => {
  const hostile = '<img src=x onerror="window.__xss=1">'.repeat(2);
  await banc(page, { titre: hostile });
  await ouvrirFiche(page, "ev_mienne");
  await page.locator('[data-affiche-rencontre="ev_mienne"]').click();
  await expect(page.locator("#afficheApercu")).toBeVisible();
  const vu = await page.evaluate(() => ({
    xss: window.__xss === 1,
    imgs: document.querySelectorAll('#modalContent img[src="x"]').length,
  }));
  expect(vu.xss, "le titre de la rencontre a été exécuté").toBe(false);
  expect(vu.imgs).toBe(0);

  const long = "Grande randonnée intergénérationnelle et conviviale autour du lac avec pique-nique partagé, "
    + "jeux pour les enfants, atelier photo et coucher de soleil sur les montagnes";
  const l = await page.evaluate((t) => PassioAffiche._lignes(t, "800 84px system-ui", 1048, 3), long);
  expect(l.length).toBe(3);
  expect(l[2].endsWith("…"), "un titre tronqué ne le dit pas").toBe(true);
  const sansEspace = await page.evaluate(() => PassioAffiche._lignes("A".repeat(200), "800 84px system-ui", 1048, 3));
  expect(sansEspace.length, "un mot sans espace sort du cadre").toBe(3);
});

test("⑤ kill switch : coupé, la fiche n'a aucun bouton d'affiche", async ({ page }) => {
  await banc(page, { coupe: true });
  await ouvrirFiche(page, "ev_mienne");
  const vu = await page.evaluate(() => ({
    qr: !!document.querySelector('#eventDetailContent [data-orga-qr="ev_mienne"]'),
    bouton: document.querySelectorAll("[data-affiche-rencontre]").length,
    actif: PassioAffiche.actif(),
  }));
  expect(vu.qr, "la coupure a retiré le QR d'accueil, qui n'est pas à elle").toBe(true);
  expect(vu.bouton, "coupé, le bouton d'affiche est encore posé").toBe(0);
  expect(vu.actif).toBe(false);
  expect(await page.evaluate(() => PassioAffiche.ouvrir("ev_mienne")), "coupé, la porte globale ouvre encore").toBe(false);
});
