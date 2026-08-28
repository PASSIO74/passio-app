// Le lien publication → activité doit SURVIVRE au rechargement.
//
// Défaut trouvé le 2026-08-28, silencieux de bout en bout : la colonne
// `posts.event_id` était ÉCRITE par `supaPublishPostWithRetry` mais absente du
// SELECT de `supaLoadPosts`. Conséquence : une publication réellement rattachée
// à une activité perdait son lien dès qu'elle revenait du réseau, et le
// « Voir l'activité » du fil (lot UI-3B) ne fonctionnait donc QUE sur le
// contenu de démonstration. Rien n'échouait : la porte vers l'IRL disparaissait
// simplement, ce qui est le pire des symptômes — indiscernable d'un lot cassé.
//
// Cette suite tient les deux faces :
//   ① une ligne portant `event_id` produit un post portant `eventId`, et
//      `refEvenement()` (UI-3B) le reconnaît ;
//   ② sur une base où la migration IRL v2 n'est pas appliquée, le SELECT qui
//      nomme `event_id` échoue EN BLOC — le repli doit rendre le fil quand
//      même, sinon le correctif viderait l'écran au lieu de l'enrichir.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Une ligne `posts` telle que la renvoie PostgREST, réduite au nécessaire.
const LIGNE = {
  id: "p_reseau_1", author_id: "u_reseau", passion_id: "musique", mood: "all",
  content: "Publication reliée à une activité.", media_url: null,
  created_at: "2026-08-28T10:00:00", is_reel: false, overlays: null, vlog: null,
  shared_from_post_id: null, shared_data: null, event_id: "e1",
  profiles: { username: "Réseau", emoji: "🎸", color: "#8b5cf6", avatar_url: null, is_private: false },
};

// Le stub minimal de `supa` : seules les tables lues par `supaLoadPosts`.
// `colonnesVues` retient ce que le code a RÉELLEMENT demandé — c'est la seule
// façon de prouver le repli sans se fier au message d'erreur.
async function poserSupa(page, opts) {
  await page.evaluate((o) => {
    window.__colonnes = [];
    MY_UID = "u_moi"; window.MY_UID = "u_moi";
    const vide = { data: [], error: null };
    const chaine = (rep) => {
      const c = {
        select: () => c, eq: () => c, in: () => c, limit: () => c,
        order: () => c, range: () => Promise.resolve(rep),
        then: (f) => Promise.resolve(rep).then(f),
      };
      return c;
    };
    supa = {
      from: function (table) {
        if (table !== "posts") return chaine(vide);
        return {
          select: function (cols) {
            window.__colonnes.push(cols);
            const nomme = cols.indexOf("event_id") !== -1;
            // La base sans la migration refuse la requête EN BLOC.
            if (o.colonneAbsente && nomme) {
              return chaine({ data: null, error: { message: 'column posts.event_id does not exist' } });
            }
            const ligne = Object.assign({}, o.ligne);
            if (!nomme) delete ligne.event_id;
            return chaine({ data: [ligne], error: null });
          },
        };
      },
    };
  }, opts);
}

test.describe("Publication reliée à une activité — relue depuis le réseau", () => {
  test("① `event_id` revient du réseau et devient `eventId`, reconnu par UI-3B", async ({ page }) => {
    await bootOnboarded(page);
    await poserSupa(page, { ligne: LIGNE, colonneAbsente: false });

    const r = await page.evaluate(async () => {
      const posts = await supaLoadPosts(0);
      const p = posts[0];
      return {
        n: posts.length,
        eventId: p ? p.eventId : null,
        // La fonction du lot UI-3B, celle qui décide de poser « Voir l'activité ».
        reconnu: !!(window.PassioUIV3 && PassioUIV3.eventRefOf && PassioUIV3.eventRefOf(p)),
        demande: window.__colonnes[0].indexOf("event_id") !== -1,
      };
    });

    expect(r.demande, "le SELECT doit nommer event_id").toBe(true);
    expect(r.n).toBe(1);
    expect(r.eventId, "le lien vers l'activité doit survivre au réseau").toBe("e1");
    expect(r.reconnu, "UI-3B doit reconnaître la référence").toBe(true);
  });

  test("② base sans la migration : le fil est rendu quand même", async ({ page }) => {
    await bootOnboarded(page);
    await poserSupa(page, { ligne: LIGNE, colonneAbsente: true });

    const r = await page.evaluate(async () => {
      const posts = await supaLoadPosts(0);
      return {
        n: posts.length,
        eventId: posts[0] ? (posts[0].eventId || null) : null,
        essais: window.__colonnes.length,
        secondSansColonne: window.__colonnes.length > 1
          && window.__colonnes[1].indexOf("event_id") === -1,
      };
    });

    // Le correctif ne doit JAMAIS coûter le fil : sans la colonne, on réessaie.
    expect(r.essais, "un second essai doit avoir lieu").toBe(2);
    expect(r.secondSansColonne, "le second essai ne nomme plus event_id").toBe(true);
    expect(r.n, "le fil est rendu malgré la colonne absente").toBe(1);
    expect(r.eventId, "sans colonne, aucune référence inventée").toBe(null);
  });
});
