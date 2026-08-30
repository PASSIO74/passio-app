// Commentaire d'un live CDV — l'id local n'était jamais remplacé par l'id serveur.
//
// ⚠️ LE DÉFAUT, mesuré le 2026-08-30. `addCdvLiveComment` (app-03) crée le
// commentaire optimiste avec `"lc_local_" + Date.now()`, puis appelle
// `supaAddCdvLiveComment`, qui génère de SON côté un identifiant totalement
// différent — `"lc_" + uid()` — et **ne le renvoie pas**. L'objet local garde
// donc un id qui n'existe nulle part en base.
//
// Conséquence : supprimer ce commentaire part sur
// `delete().eq("id", "lc_local_1756…")` — aucune ligne ne correspond, PostgREST
// répond `{ error: null }` avec 0 ligne, et le SDK Supabase ne LÈVE PAS sur ce
// cas. Le commentaire disparaît à l'écran et **revient au rechargement**.
//
// C'est un écart avec le chemin des activités, qui fait déjà la chose juste :
// `addEventComment` (app-07) attend l'id réel et corrige l'optimiste
// (`optimistic.id = realId`). On aligne le live sur l'activité.
//
// ⚠️ `supa` est un `let` de portée script : il existe comme identifiant global
// mais n'est PAS une propriété de `window`. Le stub doit être posé par
// affectation NUE — `window.supa = …` n'aurait aucun effet et le test passerait
// sans rien prouver (piège déjà payé cette nuit sur la recherche de comptes).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const LIVE_ID = "live_test_id";

async function poserDecor(page) {
  await page.evaluate((liveId) => {
    localStorage.setItem("passio_cdv_lives", JSON.stringify([{
      id: liveId, authorId: "me", destination: "Lisbonne", status: "live",
      steps: [], comments: [], createdAt: Date.now(),
    }]));
    // Stub Supabase : l'insert réussit et rend la ligne créée, comme la vraie base.
    window.__inserts = [];
    supa = {
      from: function () {
        return {
          insert: function (row) {
            window.__inserts.push(row);
            return Promise.resolve({ data: [row], error: null });
          },
        };
      },
    };
  }, LIVE_ID);
}

const commentaires = (page) => page.evaluate((liveId) => {
  const l = getCdvLives().find((x) => x.id === liveId);
  return (l && l.comments || []).map((c) => c.id);
}, LIVE_ID);

test.describe("Commentaire de live CDV — identité côté serveur", () => {
  test("l'id local est remplacé par celui que la base a réellement écrit", async ({ page }) => {
    await bootOnboarded(page);
    await poserDecor(page);

    await page.evaluate(async (liveId) => {
      const inp = document.createElement("input");
      inp.id = "cdvLiveComment";
      inp.value = "Bien joué !";
      document.body.appendChild(inp);
      await addCdvLiveComment(liveId);
      await new Promise((r) => setTimeout(r, 400));
    }, LIVE_ID);

    // Anti-creux : l'écriture doit avoir eu lieu, sinon le test ne prouve rien.
    const inserts = await page.evaluate(() => window.__inserts);
    expect(inserts.length, "l'insert Supabase doit avoir été appelé").toBe(1);
    expect(inserts[0].id).toMatch(/^lc_/);
    expect(inserts[0].id).not.toMatch(/^lc_local_/);

    // Le cœur : l'objet local porte l'id de la BASE, pas son id fictif.
    const ids = await commentaires(page);
    expect(ids.length).toBe(1);
    expect(ids[0], "l'id local doit être celui écrit en base").toBe(inserts[0].id);
    expect(ids[0]).not.toMatch(/^lc_local_/);
  });

  test("sans Supabase, le commentaire reste posé localement", async ({ page }) => {
    // Garde de non-régression : corriger l'id ne doit pas rendre l'écriture
    // locale dépendante du réseau. Hors ligne, le commentaire s'affiche quand même.
    await bootOnboarded(page);
    await page.evaluate((liveId) => {
      localStorage.setItem("passio_cdv_lives", JSON.stringify([{
        id: liveId, authorId: "me", destination: "Lisbonne", status: "live",
        steps: [], comments: [], createdAt: Date.now(),
      }]));
      supa = { from: function () { return { insert: function () { return Promise.reject(new Error("hors ligne")); } }; } };
    }, LIVE_ID);

    await page.evaluate(async (liveId) => {
      const inp = document.createElement("input");
      inp.id = "cdvLiveComment";
      inp.value = "Hors ligne";
      document.body.appendChild(inp);
      await addCdvLiveComment(liveId);
      await new Promise((r) => setTimeout(r, 400));
    }, LIVE_ID);

    const ids = await commentaires(page);
    expect(ids.length, "le commentaire doit rester visible hors ligne").toBe(1);
  });
});
