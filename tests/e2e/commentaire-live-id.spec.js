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

  test("l'affichage ne dépend PAS du réseau : le commentaire est là avant la réponse de la base", async ({ page }) => {
    // ⚠️ CE QUE CE TEST GARDE (défaut mesuré le 2026-08-30, audit de la PR #222).
    // Le passage de `addCdvLiveComment` en `async` avait placé le vidage du champ
    // et le repeint de la boîte APRÈS l'`await supaAddCdvLiveComment(...)`. Que
    // les appelants ignorent la promesse n'y change rien : ces deux gestes vivent
    // DANS la fonction, donc derrière l'attente. Sur réseau lent ou coupé, le
    // commentaire n'apparaissait qu'au bout de l'aller-retour — la personne
    // croyait que sa touche n'avait pas pris et republiait.
    //
    // L'insert ne se résout JAMAIS ici : c'est le réseau lent porté à sa limite.
    // Si le rendu repasse derrière l'`await`, il n'a alors JAMAIS lieu et ce test
    // expire. C'est ce qui le rend capable de rougir.
    await bootOnboarded(page);
    await page.evaluate((liveId) => {
      localStorage.setItem("passio_cdv_lives", JSON.stringify([{
        id: liveId, authorId: "me", destination: "Lisbonne", status: "live",
        steps: [], comments: [], createdAt: Date.now(),
      }]));
      window.__insertAppele = false;
      supa = {
        from: function () {
          return {
            insert: function () {
              window.__insertAppele = true;
              return new Promise(function () {});   // ne se résout jamais
            },
          };
        },
      };
      var box = document.getElementById("cdvCommentsBox");
      if (!box) { box = document.createElement("div"); box.id = "cdvCommentsBox"; document.body.appendChild(box); }
      box.innerHTML = "";
      var inp = document.getElementById("cdvLiveComment");
      if (!inp) { inp = document.createElement("input"); inp.id = "cdvLiveComment"; document.body.appendChild(inp); }
      inp.value = "Bien joué !";
      // ⚠️ NE PAS attendre la promesse : c'est précisément l'objet du test.
      addCdvLiveComment(liveId);
    }, LIVE_ID);

    await expect
      .poll(() => page.evaluate(() => (document.getElementById("cdvLiveComment") || {}).value),
            { timeout: 5000, message: "le champ doit être vidé sans attendre la base" })
      .toBe("");
    const html = await page.evaluate(() => document.getElementById("cdvCommentsBox").innerHTML);
    expect(html, "le commentaire doit être peint sans attendre la base").toContain("Bien jou");

    // Anti-creux : l'écriture réseau a bien été lancée et est TOUJOURS en vol —
    // sans quoi le test prouverait seulement qu'il n'y a pas eu d'appel du tout.
    expect(await page.evaluate(() => window.__insertAppele), "l'insert doit avoir été lancé").toBe(true);
    const ids = await commentaires(page);
    expect(ids.length).toBe(1);
    expect(ids[0], "l'id est encore le local tant que la base n'a pas répondu").toMatch(/^lc_local_/);
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
