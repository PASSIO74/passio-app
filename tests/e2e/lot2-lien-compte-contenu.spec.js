// ═══════════════════════════════════════════════════════════════════════════
// LOT-2 (audit UX/UI du 2026-11-10) — ARRIVER SUR UN CONTENU, CRÉER SON COMPTE,
// RETROUVER LE CONTENU
//
// PAR-C01 (P0) : « Créer mon compte » depuis une publication, une activité ou une
// bobine ouvrait le formulaire DESSOUS (z-index 50 contre 200 et 9999) : rien ne
// changeait à l'écran. PAR-C02 : après l'inscription, le contenu n'était pas
// rouvert (l'adresse `#post-<id>` est nettoyée par son routeur avant l'ouverture).
// ENT-C01 : le retour système ne fermait pas le formulaire.
//
// Visiteur réel (appareil vierge, SDK Supabase COUPÉ : `bootVisiteur` le prouve),
// donc aucun compte n'est créé : la fin d'inscription est le crochet produit
// `apresAuthentification`, appelé directement — c'est lui que `onbFinish` et la
// reprise appellent en vrai.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

// Le centre de l'écran appartient-il au formulaire de compte ?
const formulaireAuPremierPlan = (page) => page.evaluate(() => {
  const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  const onb = document.getElementById("onboarding");
  return !!(el && onb && onb.contains(el));
});

async function ouvrirPublicationDExemple(page) {
  const id = await page.evaluate(() => {
    const p = (state.seed.posts || []).find((x) => x && x.id && x.text);
    openPost(p.id);
    return p.id;
  });
  await page.waitForTimeout(500);
  return id;
}
const publicationOuverte = (page) => page.evaluate(() => {
  const pd = document.getElementById("postDetailPage");
  if (!pd || !pd.style.display || pd.style.display === "none") return null;
  const a = pd.querySelector("[data-postid]");
  return a ? a.getAttribute("data-postid") : null;
});

test.describe("LOT-2 — lien → compte → contenu", () => {
  test("① publication ouverte → « Créer mon compte » : le formulaire est au premier plan (P0)", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    const id = await ouvrirPublicationDExemple(page);
    expect(await publicationOuverte(page)).toBe(id);
    await page.evaluate(() => { requireAuthentication("aimer"); });
    await page.waitForTimeout(300);
    await page.evaluate(() => PassioFirstRun.allerInscription("aimer"));
    await page.waitForTimeout(400);
    expect(await formulaireAuPremierPlan(page), "le centre de l'écran appartient à #onboarding").toBe(true);
    const cible = await page.evaluate(() => PassioFirstRun.prefs().retour && PassioFirstRun.prefs().retour.cible);
    expect(cible).toEqual({ genre: "publication", id });
  });

  test("② fin d'inscription : la publication visée est rouverte, le rappel s'affiche", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    const id = await ouvrirPublicationDExemple(page);
    await page.evaluate(() => { requireAuthentication("aimer"); PassioFirstRun.allerInscription("aimer"); });
    await page.waitForTimeout(400);
    // Fin d'inscription : le crochet produit (aucun compte réel n'est créé ici).
    await page.evaluate(() => {
      window.__toasts = [];
      const _t = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return _t.apply(this, arguments); };
      document.getElementById("onboarding").classList.remove("active");
      PassioFirstRun.apresAuthentification();
    });
    await page.waitForTimeout(1500);
    expect(await publicationOuverte(page), "la publication du lien est rouverte").toBe(id);
    expect(await page.evaluate(() => window.__toasts.join(" | "))).toMatch(/aimer cette publication/);
  });

  test("③ retour système pendant le formulaire : il se ferme, la publication revient", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    const id = await ouvrirPublicationDExemple(page);
    await page.evaluate(() => { requireAuthentication("aimer"); PassioFirstRun.allerInscription("aimer"); });
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => document.getElementById("onboarding").classList.contains("active"))).toBe(false);
    expect(await publicationOuverte(page)).toBe(id);
  });

  test("④ « ← Continuer à explorer » : même retour sur le contenu", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    const id = await ouvrirPublicationDExemple(page);
    await page.evaluate(() => { requireAuthentication("aimer"); PassioFirstRun.allerInscription("aimer"); });
    await page.waitForTimeout(400);
    await page.click("#frBackToExplore");
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.getElementById("onboarding").classList.contains("active"))).toBe(false);
    expect(await publicationOuverte(page)).toBe(id);
  });

  // Relecture du lot : fermer le contenu reprenait son entrée d'historique et
  // laissait un retour MORT. Le contenu reste ouvert ; chaque retour fait un pas.
  test("⑥ historique : retour → formulaire fermé ; retour suivant → la publication se ferme (aucun retour avalé)", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    const id = await ouvrirPublicationDExemple(page);
    await page.evaluate(() => { requireAuthentication("aimer"); PassioFirstRun.allerInscription("aimer"); });
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(900);
    expect(await publicationOuverte(page)).toBe(id);
    await page.goBack();
    await page.waitForTimeout(900);
    expect(await publicationOuverte(page), "le second retour ferme la publication").toBe(null);
  });

  test("⑦ une fenêtre ouverte sur le formulaire (CGU) : le retour la ferme elle, le formulaire reste", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    await ouvrirPublicationDExemple(page);
    await page.evaluate(() => { requireAuthentication("aimer"); PassioFirstRun.allerInscription("aimer"); });
    await page.waitForTimeout(400);
    await page.evaluate(() => openTermsOfService());
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => ({ fenetre: document.getElementById("modalBackdrop").classList.contains("active"), formulaire: document.getElementById("onboarding").classList.contains("active") }));
    expect(r).toEqual({ fenetre: false, formulaire: true });
  });

  test("⑤ sans contenu ouvert : le formulaire s'ouvre comme avant, rien n'est mémorisé comme cible", async ({ page }) => {
    await bootVisiteur(page, { sansBienvenue: true });
    await page.evaluate(() => { requireAuthentication("aimer"); PassioFirstRun.allerInscription("aimer"); });
    await page.waitForTimeout(400);
    expect(await formulaireAuPremierPlan(page)).toBe(true);
    expect(await page.evaluate(() => (PassioFirstRun.prefs().retour || {}).cible || null)).toBe(null);
  });
});
