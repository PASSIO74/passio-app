// Suite « échappement contextuel » — non-régression des failles trouvées le
// 2026-08-15 par scripts/audit-echappement.js.
//
// Le point commun de toutes ces failles : une donnée écrite par un AUTRE compte
// atteignait le DOM sans le désinfectant de SON contexte. Trois contextes, trois
// helpers, et un helper valable ailleurs n'y suffit pas :
//   · src/href     → safeUrlAttr  (escapeHtml ferme l'attribut mais PAS le schéma)
//   · on*          → escapeJsArg  (escapeHtml échoue : le HTML décode `&#39;`
//                                  AVANT le parse JS, l'apostrophe revient)
//   · style        → _cssColor / _cssUrl
//
// ⚠️ Ce qui rend ces charges réalistes : en prod, la colonne `id` est de type
// TEXT pour posts, events, conversations, conv_messages, post_comments,
// comment_interactions et stories (vérifié dans information_schema le
// 2026-08-15). Un compte authentifié CHOISIT donc la valeur qu'il insère,
// apostrophe comprise — un identifiant n'est pas une donnée de confiance.
//
// La preuve est active : chaque charge appelle window.__pwn(). Si un seul
// contexte cède, le compteur bouge et le test rougit.
//
// ⚠️ « Active » veut dire INSÉRÉE DANS LE DOCUMENT. Jusqu'au 2026-08-30, deux
// des quatre tests gardaient la chaîne rendue sans jamais l'insérer, et
// asséraient malgré tout `executions === 0` : cette assertion était
// inatteignable, donc décorative. Un commentaire qui promet plus que le code ne
// tient est précisément ce qui fait accepter, un jour, une réécriture qui casse
// la garde. Tout ajout à ce fichier doit passer par `insererEtSecouer`.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Charges hostiles, une par contexte d'insertion. L'identifiant porte À LA FOIS
// l'apostrophe (sortie de la chaîne JS d'un handler) et le guillemet double
// (sortie de l'attribut HTML lui-même) : les deux échappements doivent tenir.
const HOSTILE = {
  id: "x'); window.__pwn(); ('\" onmouseover=\"window.__pwn()",
  url: "javascript:window.__pwn()",
  couleur: 'red" onmouseover="window.__pwn()',
  html: '<img src=x onerror="window.__pwn()">',
};

async function bootAvecSonde(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__xss = 0;
    window.__pwn = function () { window.__xss++; };
  });
}

/**
 * Secoue le DOM pour faire EXÉCUTER tout ce qui pourrait l'être, puis relève.
 *
 * ⚠️ Chercher la CHAÎNE « __pwn » dans les attributs ne prouve rien : une charge
 * correctement échappée y figure en clair et reste totalement inerte
 * (`onclick="f('x\'); window.__pwn(); (\'')"`). Le seul verdict qui vaut est
 * l'exécution — on déclenche donc réellement clic, survol et erreur de
 * chargement sur tout ce qui a été rendu.
 */
async function secouerEtRelever(page) {
  return page.evaluate(() => {
    document.querySelectorAll("body *").forEach((el) => {
      try {
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        if (el.tagName === "IMG") el.dispatchEvent(new Event("error"));
      } catch (_) {}
    });
    return { executions: window.__xss };
  });
}

/**
 * Insère RÉELLEMENT le HTML rendu dans le document, puis secoue.
 *
 * ⚠️ Ajouté le 2026-08-30, et c'est un correctif de test, pas de confort. Deux
 * tests de ce fichier gardaient la chaîne rendue par `_storyOverlaysHtml` /
 * `_commentBodyHtml` sans jamais l'insérer, puis asséraient `executions === 0`.
 * Or `secouerEtRelever` parcourt `document.querySelectorAll("body *")` : une
 * chaîne hors du document est invisible pour lui, et le compteur valait 0 quoi
 * qu'il arrive — y compris si ces fonctions avaient rendu la charge en clair.
 * L'assertion était INATTEIGNABLE, donc décorative, alors que l'en-tête du
 * fichier promet une « preuve active ». Aucune mutation de production ne
 * pouvait la faire rougir.
 *
 * Un `<img src=x>` inséré déclenche `onerror` de lui-même (la source ne charge
 * pas) : si l'échappement cède, `window.__pwn()` part sans qu'on ait rien à
 * dispatcher.
 */
async function insererEtSecouer(page, html) {
  await page.evaluate((h) => {
    let hote = document.getElementById("__hoteEchappement");
    if (!hote) {
      hote = document.createElement("div");
      hote.id = "__hoteEchappement";
      document.body.appendChild(hote);
    }
    hote.innerHTML = h;
  }, html);
  await page.waitForTimeout(250);   // le temps que les onerror naturels partent
  return secouerEtRelever(page);
}

test.describe("Échappement contextuel — contenu d'un autre compte", () => {
  test("les trois helpers ne sont pas interchangeables (contrat des helpers)", async ({ page }) => {
    await bootAvecSonde(page);
    const r = await page.evaluate((H) => ({
      // safeUrlAttr : seul à fermer le SCHÉMA.
      urlRefusee: safeUrlAttr(H.url),
      urlHttpGardee: safeUrlAttr("https://exemple.test/a.png"),
      escapeHtmlNeFermePasLeSchema: escapeHtml(H.url).startsWith("javascript:"),
      // escapeJsArg : seul à neutraliser l'apostrophe POUR LE PARSE JS.
      jsArgEchappe: escapeJsArg(H.id).indexOf("\\'") !== -1,
      escapeHtmlDansOnclick: escapeHtml(H.id).indexOf("&#39;") !== -1,
      // _cssColor : refuse tout ce qui sort de la déclaration CSS.
      couleurRefusee: _cssColor(H.couleur),
      couleurGardee: _cssColor("#7c3aed"),
    }), HOSTILE);

    expect(r.urlRefusee).toBe("#");
    expect(r.urlHttpGardee).toContain("https://exemple.test/a.png");
    // Documente POURQUOI escapeHtml ne suffit pas dans un src/href.
    expect(r.escapeHtmlNeFermePasLeSchema).toBe(true);
    expect(r.jsArgEchappe).toBe(true);
    // …et pourquoi il ne suffit pas dans un onclick : l'entité est décodée par le
    // parseur HTML avant que JS ne lise la chaîne.
    expect(r.escapeHtmlDansOnclick).toBe(true);
    expect(r.couleurRefusee).toBe("#8b5cf6");
    expect(r.couleurGardee).toBe("#7c3aed");
  });

  // ⚠️ LE CAS « carnet d'un autre compte » A ÉTÉ RETIRÉ avec la fonctionnalité
  // Carnet de voyage (ADR-011 §5) : ni `renderVlogCarousel`, ni
  // `renderCdvScreen`, ni les cartes qu'ils peignaient n'existent plus. La
  // surface d'attaque disparaît avec la surface d'affichage — ce n'est pas un
  // relâchement de garde, c'est la garde qui n'a plus rien à garder.

  test("superposition de story : position et couleur ne peuvent pas sortir de l'attribut style", async ({ page }) => {
    await bootAvecSonde(page);
    const html = await page.evaluate((H) => _storyOverlaysHtml([
      { type: "text", text: "coucou", x: '0;"><img src=x onerror="window.__pwn()">', color: H.couleur, size: "12;position:fixed" },
      { type: "gif", url: H.url, x: 10, y: 10 },
    ]), HOSTILE);

    // ⚠️ L'ORDRE COMPTE, et c'est le second temps du correctif du 2026-08-30.
    // Rendre l'assertion d'exécution ATTEIGNABLE ne suffisait pas : les
    // assertions de chaîne ci-dessous rougissent AVANT elle sur toute charge
    // portant « __pwn » en clair, donc elle restait masquée par une autre. La
    // preuve forte — la charge est insérée et n'exécute rien — passe donc en
    // PREMIER, et les recherches de sous-chaîne deviennent ce qu'elles sont :
    // un diagnostic qui dit POURQUOI, pas la garantie elle-même.
    expect((await insererEtSecouer(page, html)).executions).toBe(0);

    // Aucune balise n'a pu être créée depuis la position, et aucun handler injecté.
    expect(html).not.toContain("__pwn");
    expect(html).not.toContain("onerror=\"window");
    // L'URL hostile du GIF ne peut pas atteindre l'attribut src.
    expect(html).not.toMatch(/src="javascript:/);
  });

  test("réaction média d'un commentaire : un guillemet ne sort pas de l'attribut src", async ({ page }) => {
    await bootAvecSonde(page);
    // ⚠️ LA CHARGE A ÉTÉ CHANGÉE le 2026-08-30, et c'est le point du correctif.
    // L'ancienne était `javascript:window.__pwn()`. Or `_commentBodyHtml`
    // n'emprunte la branche `<img src>` que si `_looksLikeMediaUrl` dit oui, et
    // celle-ci exige `^https?://` : une charge `javascript:` partait TOUJOURS
    // dans la branche texte, donc n'approchait jamais l'attribut que le test
    // prétend garder. Aucune mutation de production n'aurait pu la faire
    // exécuter — l'assertion était décorative deux fois plutôt qu'une.
    //
    // La charge ci-dessous est une vraie forme d'attaque : une URL que
    // `_looksLikeMediaUrl` ACCEPTE (le motif `giphy.com` suffit), portant un
    // guillemet pour sortir de l'attribut `src` et poser son propre `onerror`.
    // Elle atteint donc `safeUrlAttr`, et c'est lui qu'on met à l'épreuve.
    const GIF_HOSTILE = 'https://media.giphy.com/a" onerror="window.__pwn()';

    const r = await page.evaluate((gifHostile) => ({
      // Un GIF de réaction est un contenu librement inséré par tout compte.
      corps: _commentBodyHtml("https://exemple.test/a.gif"),
      hostile: _commentBodyHtml(gifHostile),
      // Garde anti-creux : la charge doit VRAIMENT emprunter la branche image,
      // sinon le test ne mesure pas ce qu'il annonce.
      brancheImage: _looksLikeMediaUrl(gifHostile),
    }), GIF_HOSTILE);

    expect(r.brancheImage, "la charge doit atteindre la branche <img src>").toBe(true);

    // Preuve forte d'abord (cf. la note d'ordre du test précédent).
    expect((await insererEtSecouer(page, r.hostile)).executions).toBe(0);

    expect(r.corps).toContain("https://exemple.test/a.gif");
    // Ce qui compte : le guillemet ne sort pas de l'attribut, donc aucun
    // gestionnaire d'événement ne peut être greffé sur l'image.
    expect(r.hostile).not.toMatch(/onerror="window/);
  });
});
