// Identifiants dans un onclick — le contexte, c'est escapeJsArg.
//
// `_reactionItemsChipHtml` reçoit une chaîne d'`onclick` toute faite. Trois
// appelants la construisent ; UN SEUL échappait son identifiant
// (app-03:2098, réactions d'étape de carnet). Les deux autres — la pastille de
// réactions d'un POST (app-04) et celle d'un LIVE — concaténaient l'identifiant
// brut dans une chaîne JS placée dans un attribut HTML.
//
// ⚠️ Ce qui rend la charge réaliste : en prod, `posts.id` est de type TEXT et un
// compte authentifié CHOISIT la valeur qu'il insère (constaté dans
// information_schema le 2026-08-15, cf. echappement.spec.js). Un identifiant
// n'est pas une donnée de confiance.
//
// La preuve est ACTIVE : la charge appelle window.__pwn(). Chercher la chaîne
// dans le DOM ne prouverait rien — correctement échappée, elle y figure en clair
// et reste inerte.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// À la fois sortie de la chaîne JS (apostrophe) et sortie de l'attribut HTML
// (guillemet double) : les deux échappements doivent tenir.
//
// ⚠️ Le « // » final n'est pas décoratif — il a été trouvé par mutation. Sans
// lui, l'attribut fabriqué par la sortie vaut « window.__pwn()', event); » :
// une ERREUR DE SYNTAXE, que le navigateur avale en silence. Le test passait
// alors même SANS échappement, pour la mauvaise raison. Le commentaire rend le
// reste de l'attribut inerte et la charge réellement exécutable.
const ID_HOSTILE = "x'); window.__pwn(); ('\" onmouseover=\"window.__pwn()//";

async function bootAvecSonde(page) {
  await bootOnboarded(page);
  await page.evaluate(() => {
    window.__xss = 0;
    window.__pwn = function () { window.__xss++; };
  });
}

async function secouer(page) {
  return page.evaluate(() => {
    document.querySelectorAll("body *").forEach((el) => {
      try {
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      } catch (_) {}
    });
    return window.__xss;
  });
}

test.describe("Pastille de réactions — identifiant hostile", () => {
  test("un post dont l'identifiant est une charge ne l'exécute pas", async ({ page }) => {
    await bootAvecSonde(page);

    const rendu = await page.evaluate((id) => {
      state.supabasePosts = [{
        id, type: "text", authorId: "u_attaquant", authorName: "Attaquant",
        text: "Publication piégée", createdAt: Date.now(), passion: "musique",
        reactions: [{ id: "r1", authorId: "u_attaquant", text: "🔥", type: "emoji_reaction" }],
      }];
      // La pastille est rendue par le helper partagé : on l'appelle comme le fil.
      const html = _postReactChipHtml(id);
      const hote = document.createElement("div");
      hote.innerHTML = html;
      document.body.appendChild(hote);
      return html.length > 0;
    }, ID_HOSTILE);

    // Prémisse : la pastille a bien été rendue, sinon le test ne prouve rien.
    expect(rendu, "la pastille doit exister").toBe(true);
    await expect(page.locator(".cmt-react-chip")).toHaveCount(1);

    expect(await secouer(page), "aucune exécution").toBe(0);
  });

  // ⚠️ LE CAS « un live dont l'identifiant est une charge » A ÉTÉ RETIRÉ avec
  // le Carnet de voyage (ADR-011 §5) : `getCdvLives` n'existe plus, donc la
  // pastille de réaction d'un live ne peut plus être construite. Le cas jumeau
  // — la pastille d'un COMMENTAIRE, juste au-dessus — garde la même garantie
  // sur le même code d'échappement (`_reactionItemsChipHtml`).

  test("un identifiant normal reste cliquable — l'échappement ne casse pas le handler", async ({ page }) => {
    // Un correctif qui « sécuriserait » en cassant l'ouverture de la liste des
    // réacteurs serait aussi faux que l'absence d'échappement.
    await bootAvecSonde(page);

    const ouvert = await page.evaluate(() => {
      state.supabasePosts = [{
        id: "p_normal", type: "text", authorId: "u_a", authorName: "A",
        text: "Publication", createdAt: Date.now(), passion: "musique",
        reactions: [{ id: "r1", authorId: "u_a", text: "🔥", type: "emoji_reaction" }],
      }];
      const hote = document.createElement("div");
      hote.innerHTML = _postReactChipHtml("p_normal");
      document.body.appendChild(hote);
      let appele = false;
      const vrai = window.openPostReactors;
      window.openPostReactors = function () { appele = true; };
      hote.querySelector(".cmt-react-chip").click();
      window.openPostReactors = vrai;
      return appele;
    });

    expect(ouvert, "le handler doit bien être appelé").toBe(true);
  });
});
