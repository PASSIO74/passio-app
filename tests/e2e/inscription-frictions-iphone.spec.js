// ═══════════════════════════════════════════════════════════════════════════
// INSCRIPTION SUR iPHONE — trois frictions au moment où l'on crée son compte
// (2026-11-09)
//
// Mesurées sur iPhone, à l'instant exact où le visiteur décide de s'inscrire :
//
//   ① GOOGLE D'ABORD REFUSÉ. 3 inscriptions sur 4 passent par Google depuis
//      octobre ; la case de consentement vivait ~640 px SOUS le bouton. Le
//      premier toucher était refusé, et le refus défilait vers la case — Google
//      sortait de l'écran. La case est désormais JUSTE AU-DESSUS de Google.
//      Et ses 164 caractères n'héritent plus des capitales espacées de
//      l'intitulé d'un champ (`label.field > span`).
//   ② LA BULLE DE REPÈRE SURVIVAIT À L'INSCRIPTION. `.fr-tip` (fixed, 9000)
//      restait par-dessus `#onboarding` (50) et couvrait onglets puis champs.
//   ③ « VOIR MON FIL » SORTAIT DE L'ÉCRAN. 564-612 → 712-760 px après un choix
//      (iPhone 13, 390 × 664 utiles) ; hors écran dès l'ouverture sur iPhone SE.
//
// ⚠️ Les hauteurs sont les hauteurs UTILES sous Safari (664 et 568), pas les
// gabarits Playwright : c'est la mesure qui a démasqué `#authResendLink` le
// 2026-09-18 (capacite-sans-investir.spec.js ②).
// ⚠️ Chaque cas passe par les GESTES réels (carte de bienvenue, tuile, J'aime,
// porte d'inscription) : c'est le câblage qui manquait, pas une fonction.
// Aucune requête ne part : `bootVisiteur` coupe le SDK et l'API Supabase, et
// l'appel OAuth est bouchonné.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

const IPHONE_13 = { width: 390, height: 664 };
const IPHONE_SE = { width: 320, height: 568 };

// Ouvre l'inscription par la porte de la carte de bienvenue (lien « Créer un
// compte » du nouveau venu) et bouchonne `signInWithOAuth` : on ENREGISTRE
// l'appel, rien ne quitte la page.
async function ouvrirInscriptionVisiteur(page) {
  await bootVisiteur(page);
  await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });
  await page.locator("#frWelcome .fr-welcome-signup").click();
  await expect(page.locator("#onboarding")).toHaveClass(/active/);
  await expect(page.locator("#authTabSignup")).toHaveClass(/active/);
  // L'étape entre par `fadeIn` (300 ms, translateY 6 px) : mesurer avant la fin
  // comparerait deux géométries de l'animation, pas un défilement.
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    window.__oauth = [];
    // `supa` est un `let` de portée script : on mute l'objet, on ne le remplace pas.
    supa.auth.signInWithOAuth = async (a) => { window.__oauth.push(a); return { error: null }; };
  });
}

const geo = (s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { haut: Math.round(r.top), bas: Math.round(r.bottom), vue: window.innerHeight };
};

// ─────────────────────────────────────────────────────────────────────────
// ① La case de consentement AVANT Google
// ─────────────────────────────────────────────────────────────────────────
for (const [nom, vp] of [["iPhone 13", IPHONE_13], ["iPhone SE", IPHONE_SE]]) {
  test.describe(`① ${nom} (${vp.width} × ${vp.height})`, () => {
    test.use({ viewport: vp });

    test("① la case est JUSTE AU-DESSUS de Google, et « cocher puis Google » part sans refus ni défilement", async ({ page }) => {
      await ouvrirInscriptionVisiteur(page);

      const caseAvant = await page.evaluate(geo, "#authConsentWrap");
      const googleAvant = await page.evaluate(geo, "#authGoogleBtn");
      // Dans le DOM : la case précède le bloc Google (un seul nœud, une position).
      const ordre = await page.evaluate(() => {
        const c = document.getElementById("authConsentWrap");
        const g = document.getElementById("authGoogleBloc");
        return !!(c && g && (c.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      expect(ordre, "#authConsentWrap doit précéder #authGoogleBloc").toBe(true);
      // À l'écran : la case au-dessus du bouton, les deux sans défiler.
      expect(caseAvant.bas, "la case finit avant le haut du bouton Google").toBeLessThanOrEqual(googleAvant.haut);
      expect(caseAvant.haut, "la case est dans l'écran").toBeGreaterThanOrEqual(0);
      expect(googleAvant.bas, `Google finit à ${googleAvant.bas} px pour ${googleAvant.vue} px d'écran`).toBeLessThanOrEqual(googleAvant.vue);

      // Les VRAIS gestes : toucher la case, puis Google.
      await page.locator("#authConsent").click();
      await page.locator("#authGoogleBtn").click();
      await expect.poll(() => page.evaluate(() => window.__oauth.length), { message: "l'appel OAuth doit partir au premier toucher" }).toBe(1);
      expect(await page.evaluate(() => window.__oauth[0].provider)).toBe("google");
      // Aucun refus prononcé, ni en haut ni à côté de la case.
      await expect(page.locator("#authMsg")).not.toContainText("accepte les conditions");
      await expect(page.locator("#authConsentRefus")).toBeHidden();
      // Et rien n'a défilé : le bouton est resté où le doigt l'a trouvé.
      await page.waitForTimeout(400);
      const googleApres = await page.evaluate(geo, "#authGoogleBtn");
      expect(googleApres.haut, "Google ne doit pas avoir bougé").toBe(googleAvant.haut);
    });
  });
}

test("① bis la case n'existe qu'en création : absente en connexion, et Google y part sans elle", async ({ page }) => {
  await page.setViewportSize(IPHONE_13);
  await ouvrirInscriptionVisiteur(page);
  await page.locator("#authTabSignin").click();
  await expect(page.locator("#authConsentWrap")).toBeHidden();
  await page.locator("#authGoogleBtn").click();
  await expect.poll(() => page.evaluate(() => window.__oauth.length)).toBe(1);
  // Retour en création : la case revient, en RANGÉE (case + texte), pas en bloc.
  await page.locator("#authTabSignup").click();
  await expect(page.locator("#authConsentWrap")).toBeVisible();
  expect(await page.locator("#authConsentWrap").evaluate((el) => getComputedStyle(el).display)).toBe("flex");
});

test("① ter le texte du consentement et les aides sont en casse normale — l'intitulé garde ses capitales", async ({ page }) => {
  await page.setViewportSize(IPHONE_13);
  await ouvrirInscriptionVisiteur(page);
  const r = await page.evaluate(() => {
    const tt = (el) => (el ? getComputedStyle(el).textTransform : null);
    return {
      consentement: tt(document.querySelector("#authConsentWrap > span")),
      aideNom: tt(document.querySelector("#authNameWrap > span:last-child")),
      aideAnnee: tt(document.querySelector("#authBirthYearWrap > span:last-child")),
      intituleNom: tt(document.querySelector("#authNameWrap > span:first-child")),
      intituleEmail: tt(document.getElementById("authEmail").closest("label").querySelector("span")),
    };
  });
  expect(r.consentement, "164 caractères en capitales espacées ne se lisent pas").toBe("none");
  expect(r.aideNom).toBe("none");
  expect(r.aideAnnee).toBe("none");
  // L'intitulé d'un champ reste en capitales : la règle est RESTREINTE, pas retirée.
  expect(r.intituleNom).toBe("uppercase");
  expect(r.intituleEmail).toBe("uppercase");
});

// ─────────────────────────────────────────────────────────────────────────
// ② La bulle de repère ne survit pas à l'ouverture de l'inscription
// ─────────────────────────────────────────────────────────────────────────
test("② passion → « Voir mon fil » → bulle → J'aime → « Créer mon compte » : aucune bulle sur l'inscription", async ({ page }) => {
  await page.setViewportSize(IPHONE_13);
  await bootVisiteur(page);
  await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });
  await page.locator("#frWelcome .fr-welcome-cta").click();
  await page.locator('#frGrid [data-fr-passion="musique"]').click();
  await page.locator("#frValider").click();
  // PRÉMISSE TENUE, jamais supposée : la bulle est bien là avant l'inscription —
  // sans elle, le cas resterait vert sur le défaut.
  await expect(page.locator(".fr-tip")).toBeVisible({ timeout: 10000 });

  // J'aime (clic sur le VRAI bouton de la carte, son `onclick` inline) → la
  // fenêtre qui explique l'action → « Créer mon compte ».
  await page.evaluate(() => {
    const b = document.querySelector('#feedList .post-action[data-action="like"]');
    if (b) b.click();
  });
  await expect(page.locator("#modalContent")).toContainText("Crée ton compte pour aimer");
  await page.locator("#modalContent .fr-gate-actions .btn.primary").click();
  await expect(page.locator("#onboarding")).toHaveClass(/active/);

  // Aucune bulle visible tant que l'inscription occupe l'écran…
  await expect(page.locator(".fr-tip")).toHaveCount(0);
  await page.waitForTimeout(1500);
  await expect(page.locator(".fr-tip")).toHaveCount(0);
  // …et les onglets se touchent : rien ne les couvre.
  const touche = await page.evaluate(() => {
    const t = document.getElementById("authTabSignin");
    const r = t.getBoundingClientRect();
    const x = r.left + r.width / 2;
    return [r.top + 3, r.top + r.height / 2].every((y) => {
      const el = document.elementFromPoint(x, y);
      return !!el && (el === t || t.contains(el));
    });
  });
  expect(touche, "« Se connecter » doit recevoir le toucher").toBe(true);

  // Fermée SANS « Ne plus afficher » : au retour, le planificateur décide seul.
  const tour = await page.evaluate(() => JSON.parse(localStorage.getItem("passio_first_run_v1")).tour);
  expect(tour.abandonne, "ouvrir l'inscription n'abandonne pas le tour").toBeFalsy();
  await page.locator("#frBackToExplore").click();
  await expect(page.locator("#onboarding")).not.toHaveClass(/active/);
});

// ─────────────────────────────────────────────────────────────────────────
// ③ « Voir mon fil » reste à l'écran pendant le choix des passions
// ─────────────────────────────────────────────────────────────────────────
for (const [nom, vp] of [["iPhone 13", IPHONE_13], ["iPhone SE", IPHONE_SE]]) {
  test.describe(`③ ${nom} (${vp.width} × ${vp.height})`, () => {
    test.use({ viewport: vp });

    test("③ « Voir mon fil » est à l'écran et touchable — à l'ouverture, après un choix, après trois", async ({ page }) => {
      await bootVisiteur(page);
      await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });
      await page.locator("#frWelcome .fr-welcome-cta").click();
      await expect(page.locator("#frGrid")).toBeVisible();
      await page.waitForTimeout(450); // l'animation d'entrée de la feuille (320 ms)

      const mesure = () => page.evaluate(() => {
        const b = document.getElementById("frValider");
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { haut: Math.round(r.top), bas: Math.round(r.bottom), vue: window.innerHeight,
                 touche: !!el && (el === b || b.contains(el)), texte: b.textContent };
      });
      const verifier = (m, quand) => {
        expect(m.bas, `${quand} : « Voir mon fil » finit à ${m.bas} px pour ${m.vue} px d'écran`).toBeLessThanOrEqual(m.vue);
        expect(m.haut, `${quand} : …et commence dans l'écran`).toBeGreaterThanOrEqual(0);
        expect(m.touche, `${quand} : rien ne doit couvrir le bouton`).toBe(true);
      };

      verifier(await mesure(), "à l'ouverture");
      // Un choix fait apparaître les spécialités AU-DESSUS du pied : c'est ce qui
      // le poussait sous l'écran.
      await page.locator('#frGrid [data-fr-passion="musique"]').click();
      await expect(page.locator('#frSpecs [data-fr-spec="musique-guitare"]')).toHaveCount(1);
      const apresUn = await mesure();
      expect(apresUn.texte, "prémisse : le choix est compté").toMatch(/Voir mon fil/);
      verifier(apresUn, "après un choix");
      // Le pied est COLLÉ au bord de la feuille et opaque : sans le `bottom`
      // négatif, une bande de 24 px (padding de `.modal`) laissait les tuiles
      // défiler, visibles, sous les boutons.
      const pied = await page.evaluate(() => {
        const f = document.querySelector("#modalContent .fr-panel-footer");
        const m = document.getElementById("modalContent");
        return { piedBas: Math.round(f.getBoundingClientRect().bottom), feuilleBas: Math.round(m.getBoundingClientRect().bottom),
                 fond: getComputedStyle(f).backgroundColor, deborde: m.scrollHeight > m.clientHeight + 1 };
      });
      expect(pied.deborde, "prémisse : la feuille déborde, le pied est donc collé").toBe(true);
      expect(Math.abs(pied.piedBas - pied.feuilleBas), "le pied descend jusqu'au bord de la feuille").toBeLessThanOrEqual(1);
      expect(pied.fond, "fond opaque").not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      await page.locator('#frGrid [data-fr-passion="sport"]').click();
      await page.locator('#frGrid [data-fr-passion="cuisine"]').click();
      verifier(await mesure(), "après trois choix");

      // UN SEUL défilement : la feuille. Ni la grille ni les spécialités n'en
      // portent un à elles (trois défilements imbriqués sur iPhone SE avant).
      const propres = await page.evaluate(() => ["frGrid", "frSpecs"].map((id) => {
        const el = document.getElementById(id);
        return el.scrollHeight <= el.clientHeight + 1;
      }));
      expect(propres, "#frGrid et #frSpecs sans défilement propre").toEqual([true, true]);

      // Le geste aboutit : le bouton reçoit le toucher et le fil s'ouvre.
      await page.locator("#frValider").click();
      await expect(page.locator("#modalBackdrop")).not.toHaveClass(/active/);
      expect(await page.evaluate(() => Array.from(_activeFeedPassions))).toContain("musique");
    });
  });
}
