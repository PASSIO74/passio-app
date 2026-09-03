// ============================================================================
// LA PASTILLE DE MOOD N'EST JAMAIS UNE CAPSULE VIDE (2026-08-29)
// ----------------------------------------------------------------------------
// `moodTagLabel()` rend "" pour le neutre (`all`), pour un mood inconnu et pour
// un mood absent — c'est VOULU : la note de `PASSIO_MOOD_LABELS` dit que le
// neutre ne porte aucun badge, sinon tous les posts venus de Supabase, qui
// retombent sur `mood: "all"`, en recevraient un.
//
// Mais le `<span class="post-mood-tag">` était rendu SANS CONDITION. La classe
// porte `padding: 3px 9px`, `border: 1px solid` et un fond opaque : un libellé
// vide dessine donc une capsule creuse, mesurée à 20 × 8 px avant correctif.
// L'intention était juste, seul le rendu la trahissait.
//
// Ce fichier tient les deux bords : rien pour le neutre, la pastille complète
// pour un mood qui en a une.
// ============================================================================
const { test, expect } = require("@playwright/test");
const { bootOnboarded, sansDonneesDistantes } = require("./app-helper");

// ⚠️ CE FICHIER MESURE UN FIL, IL DOIT DONC LE POSSÉDER ENTIÈREMENT.
// Il vidait déjà les QUATRE tableaux de posts, mais pas la seule frontière que
// le code de l'application ne peut pas reprendre : le RÉSEAU. `bootOnboarded`
// fait lui-même le `goto`, donc la requête `posts` du boot est DÉJÀ PARTIE
// quand le fixture s'exécute — en CI (avec réseau) elle rapporte les vraies
// publications, qui portent leurs propres moods. La requête
// `#feedList .post-mood-tag` en trouvait alors une, et le test échouait en
// annonçant « le neutre porte une pastille » alors que la pastille venait d'un
// AUTRE post. Le verdict dépendait du contenu de la production, pas du code.
//
// Mesuré sur `main` le 2026-09-02 (run 2413, shard 4/6) : rouge trois fois de
// suite, retries compris, sur une PR qui ne touchait ni les moods ni les cartes
// du fil — exactement le symptôme décrit dans `app-helper.js`. Le déploiement
// production, qui dépend de ce job, a été sauté.
//
// `sansDonneesDistantes` est le remède maison, et il se pose AVANT
// `bootOnboarded` : posé après, il ne protège que les chargements suivants,
// jamais le premier. Sans réseau (conteneur de dev) la route ne se déclenche
// pas et le comportement local est inchangé — c'est la CI qui en fait foi.

async function poser(page, mood) {
  await page.evaluate((m) => {
    state.seed.posts = [{
      id: "p_mood_" + String(m), authorId: "u_lea", passion: "cuisine", mood: m,
      text: "Publication de contrôle.", createdAt: Date.now() - 3600000,
      likes: 0, comments: [],
    }];
    state.userPosts = []; state.supabasePosts = [];
    // QUATRIÈME tableau : `window._feedExtraPosts` est fait pour SURVIVRE aux
    // écrasements de `supabasePosts` (il protège un post arrivé pendant qu'une
    // requête était en vol). Le vider n'est donc pas une redondance : sans cela,
    // une publication RÉELLE de production ramenée par un rafraîchissement
    // asynchrone se réinvite dans le fil APRÈS le semis, et le test mesure autre
    // chose que son fixture. Défaut mesuré le 2026-09-02 sur `main` (run 2409).
    window._feedExtraPosts = [];
    saveState(); goTo("feed"); renderFeed();
  }, mood);
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const el = document.querySelector("#feedList .post-mood-tag");
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    return { present: true, texte: el.textContent, largeur: Math.round(r.width) };
  });
}

test.describe("la pastille de mood", () => {
  // Le cas majoritaire en production : tout post venu de Supabase porte "all".
  test("un post neutre n'a AUCUNE pastille, pas même une capsule vide", async ({ page }) => {
    await sansDonneesDistantes(page);
    await bootOnboarded(page);
    expect((await poser(page, "all")).present).toBe(false);
  });

  test("un mood inconnu ou absent n'en dessine pas non plus", async ({ page }) => {
    await sansDonneesDistantes(page);
    await bootOnboarded(page);
    expect((await poser(page, "mood_qui_nexiste_pas")).present).toBe(false);
    expect((await poser(page, null)).present).toBe(false);
  });

  // La garde anti-creux : sans elle, ce fichier passerait aussi si la pastille
  // avait disparu de TOUTES les publications.
  // ⚠️ Le mood de contrôle doit appartenir à une passion que le compte suit.
  // Écrit d'abord avec `irl` sur une passion étrangère, ce test sortait rouge —
  // non parce que la pastille manquait, mais parce que la PUBLICATION n'était
  // pas rendue : elle passait par le repli d'exploration, qui l'écartait (voir
  // `exploration-moods.spec.js`). Un test qui se trompe de cause est pire qu'un
  // test absent.
  test("un mood connu porte bien sa pastille, avec son libellé", async ({ page }) => {
    await sansDonneesDistantes(page);
    await bootOnboarded(page);
    const m = await poser(page, "creation");
    expect(m.present).toBe(true);
    expect(m.texte).toContain("Idées");
    expect(m.largeur).toBeGreaterThan(40);
  });
});
