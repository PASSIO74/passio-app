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

  test("carnet d'un autre compte : ni la couverture, ni l'identifiant, ni l'emoji ne s'exécutent", async ({ page }) => {
    await bootAvecSonde(page);

    await page.evaluate((H) => {
      state.supabasePosts = state.supabasePosts || [];
      state.supabasePosts.push({
        id: H.id, type: "vlog", authorId: "u_attaquant", authorName: "Attaquant",
        authorEmoji: H.html, authorColor: H.couleur, cover: H.url,
        destination: H.html, createdAt: new Date().toISOString(),
        steps: [], visibility: "public",
      });
      renderVlogCarousel();
      if (typeof renderCdvScreen === "function") renderCdvScreen();
    }, HOSTILE);

    // La carte doit bien avoir été rendue, sinon le test ne prouverait rien.
    expect(await page.locator(".cdv-feed-card, .vlog-card-mini").count()).toBeGreaterThan(0);

    expect((await secouerEtRelever(page)).executions).toBe(0);

    // Le clic est le moment de vérité pour l'identifiant : c'est là que la chaîne
    // JS de l'attribut onclick est réellement parsée puis exécutée.
    for (const sel of [".vlog-card-mini", ".cdv-feed-card", "[data-postlike]"]) {
      const el = page.locator(sel).first();
      if (await el.count()) await el.click({ timeout: 3000, force: true }).catch(() => {});
    }
    await page.waitForTimeout(300);

    expect((await secouerEtRelever(page)).executions).toBe(0);
  });

  test("superposition de story : position et couleur ne peuvent pas sortir de l'attribut style", async ({ page }) => {
    await bootAvecSonde(page);
    const html = await page.evaluate((H) => _storyOverlaysHtml([
      { type: "text", text: "coucou", x: '0;"><img src=x onerror="window.__pwn()">', color: H.couleur, size: "12;position:fixed" },
      { type: "gif", url: H.url, x: 10, y: 10 },
    ]), HOSTILE);

    // Aucune balise n'a pu être créée depuis la position, et aucun handler injecté.
    expect(html).not.toContain("__pwn");
    expect(html).not.toContain("onerror=\"window");
    // L'URL hostile du GIF ne peut pas atteindre l'attribut src.
    expect(html).not.toMatch(/src="javascript:/);

    const r = await secouerEtRelever(page);
    expect(r.executions).toBe(0);
  });

  test("réaction média d'un commentaire : une URL javascript: n'atteint jamais le src", async ({ page }) => {
    await bootAvecSonde(page);
    const r = await page.evaluate((H) => ({
      // Un GIF de réaction est un contenu librement inséré par tout compte.
      corps: _commentBodyHtml("https://exemple.test/a.gif"),
      hostile: _commentBodyHtml(H.url),
    }), HOSTILE);

    expect(r.corps).toContain("https://exemple.test/a.gif");
    // Une charge `javascript:` peut rester VISIBLE en texte — c'est inoffensif et
    // c'est le comportement voulu. Ce qui compte : qu'elle n'atteigne jamais un
    // attribut src/href, seul endroit où le navigateur l'exécuterait.
    expect(r.hostile).not.toMatch(/(src|href)="javascript:/);
    expect((await secouerEtRelever(page)).executions).toBe(0);
  });
});
