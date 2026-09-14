// ASTRA-09 / EXP-09 — l'identité du responsable du traitement est donnée À LA
// COLLECTE (art. 13 RGPD), et CONT-11 / SUP-01 — la politique dit ce qu'un
// compte privé protège.
//
// L'anonymat de l'éditeur non professionnel (LCEN art. 1-1, II) vaut pour les
// mentions légales du site ; il ne dispense pas d'informer les personnes de
// l'identité du responsable du traitement au moment où leurs données sont
// recueillies. La politique promettait cette identité « à toute personne qui
// exerce ses droits » — donc APRÈS la collecte. Décision de Benjamin le
// 2026-09-14 : voie (a), se nommer dans la politique et à l'inscription ;
// et « 2 » : un compte privé protège les publications et stories dans
// l'application, pas l'hébergement des fichiers — on l'écrit.
//
// Ce que cette suite exige :
//   ① la politique nomme le responsable dans son §1 — un nom VIDE s'affiche
//      « [à compléter] » EN CLAIR, jamais une promesse différée (RÉINJECTION) ;
//   ② l'écran d'inscription porte la ligne du responsable, en mode inscription
//      seulement, avec le même texte que legal-textes.js ;
//   ③ la politique (§2 ter) et le réglage « Compte privé » disent la même
//      chose : couverture visible, fichiers ouvrables par lien direct ;
//   ④ la version de la politique SUIT le texte.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("ASTRA-09 — responsable du traitement à la collecte", () => {
  test("① la politique nomme le responsable dans son §1 — ou dit [à compléter] en clair", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const div = document.createElement("div"); div.innerHTML = passioTextePolitique();
      const p1 = Array.from(div.querySelectorAll("p")).find((p) => /1\. Qui traite tes données/.test(p.textContent));
      return { p1: p1 ? p1.textContent : "", nom: passioNomResponsable(), ligne: passioLigneResponsable(),
               contact: PASSIO_EDITEUR.responsable && PASSIO_EDITEUR.responsable.contact };
    });
    // RÉINJECTION : sur le code d'avant, §1 dit « communique son identité complète à toute personne qui exerce ses droits ».
    expect(r.p1).toMatch(/Le responsable du traitement est /);
    expect(r.p1).not.toMatch(/exerce ses droits/);
    expect(r.p1).toContain(r.nom);
    expect(r.p1).toContain(r.contact);
    expect(r.p1).toMatch(/dès l.inscription/);
    // Le nom vide ne se cache pas : il s'affiche.
    if (!r.nom || r.nom === "[à compléter]") expect(r.p1).toContain("[à compléter]");
    expect(r.ligne).toContain(r.nom);
  });

  test("② l'écran d'inscription porte la ligne du responsable, en inscription seulement", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      switchAuthTab("signin");
      const el = document.getElementById("authResponsable");
      const enConnexion = el ? el.style.display : "absent";
      switchAuthTab("signup");
      return { enConnexion, enInscription: el ? el.style.display : "absent", texte: el ? el.textContent : "", attendu: passioLigneResponsable() };
    });
    expect(r.enConnexion).toBe("none");
    expect(r.enInscription).toBe("");
    expect(r.texte).toBe(r.attendu);
    expect(r.texte).toMatch(/^Responsable du traitement de tes données : /);
  });

  test("③ politique et réglage « Compte privé » disent la même chose", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => {
      const div = document.createElement("div"); div.innerHTML = passioTextePolitique();
      const p = Array.from(div.querySelectorAll("p")).find((x) => /2 ter\./.test(x.textContent));
      return { politique: p ? p.textContent : "" };
    });
    expect(r.politique).toMatch(/photo de couverture/);
    expect(r.politique).toMatch(/lien direct/);
    expect(r.politique).toMatch(/publications et stories/);
    // Le réglage, dans le formulaire de profil (texte statique du gabarit).
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "js", "app-06-reels-partage.js"), "utf8");
    expect(src).toMatch(/ta photo de couverture et tes passions restent visibles/);
    expect(src).toMatch(/ouvrables par lien direct/);
  });

  test("④ la version de la politique suit le texte", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => ({ version: PASSIO_CONFIDENTIALITE_VERSION, texte: passioTextePolitique() }));
    expect(r.version).toBe("2026-09-14");
    expect(r.texte).toContain(r.version);
  });
});
