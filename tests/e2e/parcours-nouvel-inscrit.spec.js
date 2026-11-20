// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS DU NOUVEL INSCRIT — trois frictions au choix des passions (2026-11-20)
//
// Relevées en refaisant le parcours d'un visiteur à 390 × 664 (hauteur utile
// d'un iPhone sous Safari), carte de bienvenue → « Choisir mes passions » →
// « Voir mon fil », avant l'arrivée des premiers testeurs :
//
//   ① LE CLAVIER S'OUVRAIT TOUT SEUL. Le panneau posait le focus dans la
//      recherche 60 ms après le toucher : sur un téléphone, le clavier montait
//      et recouvrait la grille et « Voir mon fil ». Le focus ne se pose plus
//      qu'avec un pointeur fin (souris, pavé) — le poste de travail garde son
//      raccourci, et c'est le témoin de ce cas.
//   ② TROIS MESSAGES À LA FOIS. Le toast « Ton fil est à toi », la note
//      « Gardées sur cet appareil » et la bulle « Un Fil construit autour de tes
//      passions » arrivaient ensemble, le toast (3 s) posé SUR la rangée
//      « Ne plus afficher / Compris » de la bulle (700 ms). Quand la note se
//      pose, le toast se tait ; sinon la bulle attend la fin du toast.
//   ③ LA NOTE SUR TROIS LIGNES. À 390 px, texte, bouton et × passaient chacun
//      sur leur ligne, le × seul en bas à gauche : 124 px de haut. Le × sort du
//      flux, à droite.
//   ④ UN LIEN DE CONFIRMATION PÉRIMÉ NE DISAIT RIEN. Supabase revient avec
//      `#error=access_denied&error_code=otp_expired…` : rien ne le lisait, la
//      personne qui venait de s'inscrire retombait sur le fil en visiteur, sans
//      un mot ni un moyen de se renvoyer le lien. Mesuré en production le
//      20/11 : 2 inscriptions par e-mail sur 10 jamais confirmées.
//
// Aucune requête ne part : `bootVisiteur` coupe le SDK et l'API Supabase ; le
// renvoi du lien et le captcha sont remplacés par des doubles qui enregistrent.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootVisiteur } = require("./first-run-helper");

const IPHONE_13 = { width: 390, height: 664 };
const IPHONE_SE = { width: 320, height: 568 };

// Ouvre le panneau par le GESTE réel du nouveau venu : le bouton de la carte.
async function ouvrirPanneauParLaCarte(page) {
  await expect(page.locator("#frWelcome")).toBeVisible({ timeout: 15000 });
  await page.locator("#frWelcome .fr-welcome-cta").click();
  await expect(page.locator("#frValider")).toBeVisible();
  // Le focus différé part à 60 ms : on lit APRÈS.
  await page.waitForTimeout(400);
}

// Échantillonne, toutes les 40 ms, ce que la personne voit : un toast « Ton fil
// est à toi », une bulle de repère. Posé AVANT le geste mesuré.
async function poserSonde(page) {
  await page.evaluate(() => {
    window.__vu = [];
    const t0 = performance.now();
    window.__sonde = setInterval(() => {
      const toast = [...document.querySelectorAll("#toastStack .toast")]
        .some((t) => /Ton fil est à toi/.test(t.textContent || ""));
      // ⚠️ PAS `offsetParent` : il vaut TOUJOURS null pour un élément en
      // `position: fixed` — et la bulle l'est. La première version de cette
      // sonde ne voyait donc jamais la bulle, et « jamais ensemble » passait à vide.
      const tip = document.querySelector(".fr-tip");
      const bulle = !!tip && (() => {
        const cs = getComputedStyle(tip), r = tip.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
      })();
      window.__vu.push({ t: Math.round(performance.now() - t0), toast, bulle });
    }, 40);
  });
}
async function lireSonde(page) {
  return page.evaluate(() => { clearInterval(window.__sonde); return window.__vu; });
}

async function choisirEtValider(page, ids) {
  for (const id of ids) await page.locator(`#frGrid [data-fr-passion="${id}"]`).click();
  await poserSonde(page);
  await page.locator("#frValider").click();
}

// ─────────────────────────────────────────────────────────────────────────
// ① Le focus de la recherche
// ─────────────────────────────────────────────────────────────────────────
test.describe("① téléphone tactile : ouvrir le panneau n'ouvre pas le clavier", () => {
  test.use({ viewport: IPHONE_13, hasTouch: true, isMobile: true });

  test("① la recherche n'a pas le focus à l'ouverture ; elle reste à un toucher", async ({ page }) => {
    await bootVisiteur(page);
    // Prémisse VÉRIFIÉE : l'appareil émulé n'a pas de pointeur fin, sinon le
    // cas mesurerait le poste de travail.
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(false);
    await ouvrirPanneauParLaCarte(page);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).not.toBe("frSearch");
    // La recherche n'a pas disparu : un toucher, et on tape.
    await page.locator("#frSearch").tap();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("frSearch");
  });
});

test.describe("① témoin — poste de travail : le raccourci reste", () => {
  test("① avec une souris, la recherche reçoit le focus à l'ouverture", async ({ page }) => {
    await bootVisiteur(page);
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
    await ouvrirPanneauParLaCarte(page);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("frSearch");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ② Un message à la fois
// ─────────────────────────────────────────────────────────────────────────
test.describe("② après « Voir mon fil », un message à la fois", () => {
  test.use({ viewport: IPHONE_13 });

  test("② première validation : la note parle, aucun toast, la bulle seule", async ({ page }) => {
    await bootVisiteur(page);
    await ouvrirPanneauParLaCarte(page);
    await choisirEtValider(page, ["musique", "cuisine", "voyage"]);
    await expect(page.locator("#frNoteLocale")).toBeVisible();
    await expect(page.locator(".fr-tip")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(3500);   // la durée d'un toast, s'il était parti
    const vu = await lireSonde(page);
    expect(vu.length).toBeGreaterThan(40);
    expect(vu.filter((e) => e.toast).length).toBe(0);
    expect(vu.some((e) => e.bulle)).toBe(true);
  });

  test("② validation suivante (note déjà vue) : le toast, PUIS la bulle — jamais ensemble", async ({ page }) => {
    await bootVisiteur(page);
    await ouvrirPanneauParLaCarte(page);
    await choisirEtValider(page, ["musique"]);
    await expect(page.locator(".fr-tip")).toBeVisible({ timeout: 5000 });
    await page.locator(".fr-tip").getByRole("button", { name: "Compris" }).click();
    await lireSonde(page);

    // Le panneau, rouvert pour modifier : la note a déjà été vue.
    await page.evaluate(() => PassioFirstRun.ouvrirPersonnalisation("test"));
    await expect(page.locator("#frValider")).toBeVisible();
    await choisirEtValider(page, ["cuisine"]);
    await expect(page.locator(".fr-tip")).toBeVisible({ timeout: 7000 });
    const vu = await lireSonde(page);
    // Le toast ET la bulle ont bien parlé (sinon « jamais ensemble » serait vrai à vide)…
    expect(vu.some((e) => e.toast)).toBe(true);
    expect(vu.some((e) => e.bulle)).toBe(true);
    // …jamais en même temps…
    expect(vu.filter((e) => e.toast && e.bulle)).toEqual([]);
    // …et dans cet ordre : la bulle après le toast.
    const premierToast = vu.findIndex((e) => e.toast), premiereBulle = vu.findIndex((e) => e.bulle);
    expect(premiereBulle).toBeGreaterThan(premierToast);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ③ La note « Gardées sur cet appareil »
// ─────────────────────────────────────────────────────────────────────────
for (const [nom, vp] of [["iPhone 13", IPHONE_13], ["iPhone SE", IPHONE_SE]]) {
  test.describe(`③ ${nom} (${vp.width} × ${vp.height})`, () => {
    test.use({ viewport: vp });

    test("③ deux lignes au plus, le × à droite du bouton, chacun touchable", async ({ page }) => {
      await bootVisiteur(page);
      await ouvrirPanneauParLaCarte(page);
      await choisirEtValider(page, ["musique"]);
      await lireSonde(page);
      const note = page.locator("#frNoteLocale");
      await expect(note).toBeVisible();
      // La bulle du repère s'ancre ici : on la referme pour toucher la note.
      await expect(page.locator(".fr-tip")).toBeVisible({ timeout: 5000 });
      await page.locator(".fr-tip").getByRole("button", { name: "Compris" }).click();
      await note.scrollIntoViewIfNeeded();

      const g = await page.evaluate(() => {
        const n = document.getElementById("frNoteLocale");
        const r = (el) => { const b = el.getBoundingClientRect(); return { g: b.left, d: b.right, h: b.top, b: b.bottom }; };
        const x = n.querySelector(".fr-note-locale-fermer"), cta = n.querySelector(".fr-note-locale-cta");
        const centre = (el) => { const b = el.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e === el || el.contains(e); };
        return { note: r(n), x: r(x), cta: r(cta), xTouche: centre(x), ctaTouche: centre(cta) };
      });
      // Avant : 124 px (texte, bouton, × — trois lignes).
      expect(g.note.b - g.note.h).toBeLessThanOrEqual(90);
      // Le × est dans la note, à DROITE du bouton, sans chevauchement.
      expect(g.x.d).toBeLessThanOrEqual(g.note.d);
      expect(g.x.g).toBeGreaterThanOrEqual(g.cta.d - 1);
      expect(g.x.h).toBeGreaterThanOrEqual(g.note.h - 1);
      expect(g.x.b).toBeLessThanOrEqual(g.note.b + 1);
      expect(g.xTouche).toBe(true);
      expect(g.ctaTouche).toBe(true);
      // Et il ferme.
      await note.locator(".fr-note-locale-fermer").click();
      await expect(note).toHaveCount(0);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// ④ Un lien reçu par e-mail qui n'ouvre rien dit pourquoi
// ─────────────────────────────────────────────────────────────────────────
const LIEN_PERIME = "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

async function doublerRenvoi(page) {
  await page.evaluate(() => {
    window.__renvois = [];
    // `supa` est un `let` de portée script : on mute l'objet, on ne le remplace pas.
    supa.auth.resend = async (a) => { window.__renvois.push(a); return { data: {}, error: null }; };
    // Le captcha n'est pas le sujet : jeton absent, comme sitekey vide.
    window.captchaJeton = async () => undefined;
    window.captchaReinitialiser = () => {};
  });
}

async function attendreEcranDuRefus(page) {
  await expect(page.locator("#onboarding")).toHaveClass(/active/, { timeout: 15000 });
  await expect(page.locator("#authTabSignin")).toHaveClass(/active/);
  await expect(page.locator("#authMsg")).toContainText("n'est plus valable");
  await expect(page.locator("#authResendTop")).toBeVisible();
  // L'exploration reste à un toucher : on n'enferme personne dans le formulaire.
  await expect(page.locator("#frBackToExplore")).toBeVisible();
  // La réponse d'Auth a quitté l'adresse : un rechargement ne la rejoue pas.
  expect(await page.evaluate(() => location.href)).not.toMatch(/error_code|error_description|error=/);
}

test.describe("④ lien de confirmation périmé", () => {
  test.use({ viewport: IPHONE_13 });

  test("④ (fragment) la connexion s'ouvre, dit pourquoi, et renvoie le lien à l'adresse SAISIE", async ({ page }) => {
    await bootVisiteur(page, { hash: "#" + LIEN_PERIME });
    await attendreEcranDuRefus(page);
    await doublerRenvoi(page);

    // Sans adresse : on NOMME le champ (il est sous le bouton, pas « ci-dessus »)
    // et on l'amène sous le doigt ; rien ne part.
    await page.locator("#authResendTopBtn").click();
    await expect(page.locator("#authMsg")).toContainText("Adresse e-mail");
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("authEmail");
    expect(await page.evaluate(() => window.__renvois.length)).toBe(0);

    // Avec l'adresse : le lien repart, vers elle.
    await page.locator("#authEmail").fill("nouvelle@exemple.test");
    await page.locator("#authResendTopBtn").click();
    await expect.poll(() => page.evaluate(() => window.__renvois.length)).toBe(1);
    expect(await page.evaluate(() => window.__renvois[0])).toMatchObject({ type: "signup", email: "nouvelle@exemple.test" });

    // Retour à l'exploration : l'écran de connexion avait poussé SA propre entrée
    // (#compte), qui masquait l'adresse d'arrivée. Le retour la rend : elle ne
    // doit plus porter la réponse d'Auth — sans le nettoyage, revenir en
    // arrière, puis recharger, rejouait le refus.
    await page.locator("#frBackToExplore").click();
    await expect(page.locator("#onboarding.active")).toHaveCount(0);
    await page.waitForTimeout(600);   // le retour d'historique est asynchrone
    expect(await page.evaluate(() => location.href)).not.toMatch(/error_code|error_description|error=/);
  });

  test("④ bis (paramètres de requête) même écran, même nettoyage", async ({ page }) => {
    await bootVisiteur(page, { query: "?" + LIEN_PERIME });
    await attendreEcranDuRefus(page);
  });

  test("④ ter aucun faux refus : seule une réponse d'Auth complète est lue, et son code est nettoyé", async ({ page }) => {
    await bootVisiteur(page);
    // Un démarrage ordinaire n'ouvre pas la connexion.
    await expect(page.locator("#onboarding.active")).toHaveCount(0);
    const lus = await page.evaluate(() => {
      const lire = (h) => { history.replaceState(history.state, "", location.pathname + h); return lireRefusLienAuth(); };
      const r = {
        post: lire("#post-abc"),
        motNu: lire("#error"),
        sansDescription: lire("#x=1&error=foo"),
        complet: lire("#error=access_denied&error_description=Oups"),
        hostile: lire("#error_code=%3Cimg%20src%3Dx%3E"),
      };
      history.replaceState(history.state, "", location.pathname);
      return r;
    });
    expect(lus.post).toBeNull();
    expect(lus.motNu).toBeNull();
    expect(lus.sansDescription).toBeNull();
    expect(lus.complet).toEqual({ code: "access_denied" });
    // Le code vient de l'adresse, donc de n'importe qui : il ne voyage que nettoyé.
    expect(lus.hostile).toEqual({ code: "autre" });
  });
});
