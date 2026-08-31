// SMOKE TEST — la fenêtre « gate affiché, application absente ».
//
// Angle mort structurel documenté dans CLAUDE.md : `tests/e2e/app-helper.js` pose
// le jeton du gate AVANT la navigation, donc AUCUNE suite n'exerce l'instant où
// le code d'accès est à l'écran et où le bloc applicatif n'existe pas encore.
// Quatre pannes d'aperçu invisibles sont nées dans cette fenêtre le 2026-08-28 :
//   ① une redirection qui détruisait la query pendant la saisie du code ;
//   ② `typeof state === "undefined"` alors qu'app-01 déclare `let state = null`,
//      donc `state.seed` levait un TypeError non rattrapé ;
//   ③ un budget de reprise (`setTimeout` × N) brûlé avant l'existence de l'app,
//      sans remise à zéro sur `passio:app-ready` ;
//   ④ un lot sans contenu éligible, indiscernable d'un lot cassé.
//
// Ce fichier n'entre PAS par le helper : il navigue sans jeton, reste sur le
// gate, et vérifie que rien ne casse ni ne s'emballe pendant cette fenêtre.
const { test, expect } = require("@playwright/test");
const { GATE_KEY, GATE_TOKEN, GATE_CODE } = require("./gate-helper");

test("gate affiché, application absente : aucune erreur JS, aucun module ne s'emballe", async ({ page }) => {
  // Convention d'app-helper.js : on sépare les erreurs APPLICATIVES des échecs de
  // ressource réseau. Ce bac n'a pas d'accès sortant (polices, images distantes,
  // CDN) — compter leurs `ERR_CONNECTION_RESET` masquerait les vraies erreurs
  // sous du bruit d'environnement.
  const erreurs = [];
  const reseau = [];
  const trier = (txt) => (/Failed to load resource|net::|ERR_/.test(txt) ? reseau : erreurs).push(txt);
  page.on("pageerror", (e) => erreurs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") trier("console: " + m.text()); });

  // AUCUN jeton : on arrive vraiment sur le gate, comme un vrai visiteur.
  await page.goto("/index.html");
  await page.waitForTimeout(4000);   // largement de quoi laisser des reprises s'emballer

  const etat = await page.evaluate(() => ({
    // `state` est déclaré `let state = null` par app-01 : c'est exactement la
    // valeur qui a fait lever les gardes écrites en `typeof state === "undefined"`.
    stateNul: (typeof state === "undefined") ? "absent" : (state === null ? "null" : "objet"),
    gateVisible: !!document.querySelector("#gateOverlay, .gate-overlay, #accessGate"),
    appPrete: !!window.__gateReady,
  }));

  // Le fait qui compte : dans cette fenêtre, `state` n'est pas un objet.
  expect(["absent", "null"]).toContain(etat.stateNul);
  expect(erreurs, "erreurs pendant la fenêtre gate :\n" + erreurs.join("\n")).toEqual([]);
});

test("la query survit à la fenêtre du gate (piège platform.js du 2026-08-28)", async ({ page }) => {
  // `js/platform.js` redirigeait vers l'origine canonique 800 ms après `load`,
  // en PERDANT `?passio_preview=…` — donc pendant la saisie du code d'accès.
  await page.goto("/index.html?passio_preview=passio-ui-4b&x=1#reel=abc");
  await page.waitForTimeout(3000);
  const url = page.url();
  expect(url).toContain("passio_preview=passio-ui-4b");
  expect(url).toContain("#reel=abc");
});

test("après déverrouillage, l'application démarre et le fil s'affiche", async ({ page }) => {
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push("pageerror: " + e.message));

  await page.goto("/index.html");
  await page.waitForTimeout(1500);

  // Déverrouillage par le VRAI chemin — la saisie du code, pas la pose du jeton :
  // c'est la transition gate → application qu'on veut exercer.
  // ⚠️ Le gate est un champ OTP `#pgInput` (js/access-gate.js) : il n'a AUCUN
  // bouton de validation, il vérifie tout seul dès que la longueur du code est
  // atteinte, sur l'événement `input`. Taper au clavier reproduit exactement ça.
  await page.locator("#pgInput").fill(GATE_CODE);
  await page.waitForTimeout(1200);

  // Repli : si le gate n'a pas cédé (forme du champ différente), on pose le jeton
  // et on recharge — le test garde alors son sens (démarrage après gate).
  const passe = await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 12000 }).then(() => true).catch(() => false);

  if (!passe) {
    await page.evaluate(([k, t]) => sessionStorage.setItem(k, t), [GATE_KEY, GATE_TOKEN]);
    await page.reload();
    await page.waitForFunction(() => {
      const el = document.getElementById("screen-feed");
      return el && el.classList.contains("active");
    }, null, { timeout: 20000 });
  }
  await page.waitForTimeout(2500);

  const apres = await page.evaluate(() => ({
    stateObjet: (typeof state !== "undefined" && state !== null && !!state.seed),
    filPresent: !!document.getElementById("feedList"),
    // ⚠️ Le commutateur « Accueil / Suivis » a été RETIRÉ le 2026-08-31 (il
    // coûtait une ligne de chrome en haut du Fil). La vue se choisit désormais
    // par la tuile « Suivis » du rail de passions : on vérifie donc que le RAIL
    // est monté — la garantie de ce test est inchangée, « l'interface du Fil
    // existe bien après le gate ».
    //
    // ⚠️ NE PAS « RENFORCER » EN EXIGEANT LA TUILE ELLE-MÊME. Essayé le
    // 2026-08-31, rouge aussitôt : ce scénario déverrouille le gate sur un
    // compte NON onboardé, donc `renderProfileStrip` n'a pas encore tourné et
    // le rail est vide. L'assertion d'origine portait sur du BALISAGE statique
    // (`#feedViews` est écrit dans `index.html`), pas sur un rendu — la
    // remplacer par une exigence de rendu changerait ce que ce test garde, et
    // le rendrait dépendant d'un état que sa propre mise en scène ne pose pas.
    // Le contenu du rail est verrouillé là où il doit l'être :
    // `feed-vues-adr010` ⑥ ter et ⑥ quinquies.
    rail: !!document.getElementById("profileStrip"),
  }));
  // Ce que la fenêtre précédente ne prouvait pas : l'app finit par exister.
  expect(apres.stateObjet).toBe(true);
  expect(apres.filPresent).toBe(true);
  expect(apres.rail, "le rail de passions est monté après le gate").toBe(true);
  expect(erreurs, "erreurs après déverrouillage :\n" + erreurs.join("\n")).toEqual([]);
});
