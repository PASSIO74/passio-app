// ═══════════════════════════════════════════════════════════════════════════
// LOT-50 (audit UX/UI du 2026-11-10, FIL-C05) — UN NOM, UNE FORME
// Le même fil s'écrivait « Discussion (N) », « Discussion · N » ou
// « Commentaires (N) ». Une seule forme : « Discussion (N) ».
//   ① la page d'une publication l'affiche, avec le compte du fil ;
//   ② aucun site du code n'écrit plus « Discussion · » ni « Commentaires (… ».
// (Le compte inclut les réponses chargées : choix de #900, verrouillé par
// capacite-fil-compteurs.)
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { bootOnboarded } = require("./app-helper");

test("① la page d'une publication titre « Discussion (N) »", async ({ page }) => {
  await bootOnboarded(page);
  const r = await page.evaluate(async () => {
    const p = state.seed.posts.find((x) => Array.isArray(x.comments) && x.comments.length) || state.seed.posts[0];
    openPost(p.id);
    await new Promise((res) => setTimeout(res, 400));
    const t = document.querySelector(".post-page-intertitre");
    return { titre: t ? t.textContent.trim() : null, n: nbCommentairesPost(p) };
  });
  expect(r.titre).toBe("Discussion (" + r.n + ")");
});

test("② « Discussion (N) » est la seule forme écrite par le code", () => {
  const racine = path.join(__dirname, "..", "..");
  const sources = ["js/app-02-state-utils.js", "js/app-04-comments-shop.js"].map((f) => fs.readFileSync(path.join(racine, f), "utf8")).join("\n");
  expect(sources).not.toMatch(/"Discussion · "/);
  expect(sources).not.toMatch(/Commentaires \(\$\{/);
});
