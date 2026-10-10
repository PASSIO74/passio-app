// Une réaction emoji ne doit jamais s'effacer elle-même (2026-10-10).
//
// « Une réaction par personne » s'écrit en deux requêtes : effacer MES
// réactions sur la cible, puis insérer la nouvelle. Elles partaient en même
// temps ; quand la suppression arrivait APRÈS l'insertion, la réaction posée
// disparaissait chez tout le monde. Trouvé par `multi-comptes.spec.js`
// (interactions sur un post), rouge 2 fois sur 4 sur le staging.
//
// Le banc remplace les deux écritures par un faux serveur dont la suppression
// est LENTE (300 ms) et l'insertion rapide — exactement l'ordre d'arrivée qui
// effaçait la réaction — et mesure l'état FINAL du serveur, pas l'appel.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function banc(page) {
  await bootOnboarded(page);
  return page.evaluate(() => {
    window.__serveur = [];   // réactions de MON compte sur le serveur : [{ cible, emoji }]
    window.__journal = [];   // ordre des opérations, début (+) et fin (-)
    const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
    window.supaCommentRemoveReactions = async (cible) => {
      window.__journal.push("R+");
      await attendre(300);
      window.__serveur = window.__serveur.filter((x) => x.cible !== cible);
      window.__journal.push("R-");
    };
    window.supaCommentInteract = async (cible, postId, kind, emoji) => {
      window.__journal.push("I+" + emoji);
      await attendre(10);
      window.__serveur.push({ cible, emoji });
      window.__journal.push("I-");
      return true;
    };
    window.supaInsertNotif = () => {};
    return state.seed.posts[0].id;
  });
}

const etatFinal = (page, ms = 1500) => page.waitForTimeout(ms).then(() =>
  page.evaluate(() => ({ serveur: window.__serveur.map((x) => x.emoji), journal: window.__journal.slice() })));

test.describe("Réaction emoji — la suppression passe AVANT l'insertion", () => {
  test("① une réaction sur un post survit à une suppression lente", async ({ page }) => {
    const pid = await banc(page);
    await page.evaluate((id) => addEmojiToPost(id, "😍"), pid);
    const r = await etatFinal(page);
    expect(r.serveur, "la réaction posée est toujours là").toEqual(["😍"]);
    expect(r.journal).toEqual(["R+", "R-", "I+😍", "I-"]);
  });

  test("② deux réactions tapées vite : UNE seule reste, la dernière", async ({ page }) => {
    const pid = await banc(page);
    await page.evaluate((id) => { addEmojiToPost(id, "😍"); addEmojiToPost(id, "🔥"); }, pid);
    const r = await etatFinal(page, 2000);
    expect(r.serveur, "jamais deux réactions du même compte").toEqual(["🔥"]);
    expect(r.journal).toEqual(["R+", "R-", "I+😍", "I-", "R+", "R-", "I+🔥", "I-"]);
  });

  test("③ re-taper la même réaction la retire, sans rien réinsérer", async ({ page }) => {
    const pid = await banc(page);
    await page.evaluate((id) => addEmojiToPost(id, "😍"), pid);
    await etatFinal(page);
    await page.evaluate((id) => addEmojiToPost(id, "😍"), pid);
    const r = await etatFinal(page);
    expect(r.serveur).toEqual([]);
    expect(r.journal.slice(4)).toEqual(["R+", "R-"]);
  });

  test("④ même règle pour une réaction sur un COMMENTAIRE", async ({ page }) => {
    const pid = await banc(page);
    await page.evaluate((id) => {
      const p = findPostAnywhere(id);
      p.comments = p.comments || [];
      p.comments.unshift({ id: "c_ordre", authorId: "u_lea", text: "salut", replies: [], likes: 0, likedBy: [], createdAt: Date.now() });
      addEmojiToComment(id, "c_ordre", "👏");
    }, pid);
    const r = await etatFinal(page);
    expect(r.serveur).toEqual(["👏"]);
    expect(r.journal).toEqual(["R+", "R-", "I+👏", "I-"]);
  });
});
