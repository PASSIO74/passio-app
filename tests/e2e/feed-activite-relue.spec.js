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

// Une carte d'activité n'est pas la republication d'un post : elle n'a pas de
// shared_from_post_id. Éprouver les vraies frontières écriture/lecture, sans
// activité en cache, empêche un aperçu local de masquer une perte du snapshot.
const ACTIVITE = {
  kind: "event", id: "ev_carte_reseau", title: "Atelier musique", city: "Lyon", venue: "",
  date: new Date(2026, 10, 21, 18, 0).getTime(), passion: "musique",
  desc: "Fabriquer ensemble un instrument.", coverUrl: "https://images.example.test/activite.png",
};
const TEXTE_ACTIVITE = "📍 A partagé une activité\n\nAtelier musique\n🎸 Musique · Lyon · 21 nov · 18h";

async function verifierCarteRelue(page) {
  await page.route(ACTIVITE.coverUrl, (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=", "base64"),
  }));
  const relu = await page.evaluate(async () => {
    state.seed.events = []; state.userEvents = [];
    const posts = await supaLoadPosts(0);
    document.getElementById("feedList").innerHTML = posts.map(renderPostHTML).join("");
    return { snapshot: posts[0]?.sharedReelData, texte: texteActivitePartagee(posts[0]) };
  });
  expect(relu.snapshot).toEqual(ACTIVITE);
  expect(relu.texte).toBe("📍 A partagé une activité");
  const carte = page.locator("#feedList .post-activite");
  await expect(carte).toBeVisible();
  await expect(carte.locator(".post-activite-titre")).toHaveText(ACTIVITE.title);
  await expect(carte.locator(".post-activite-desc")).toHaveText(ACTIVITE.desc);
  await expect(carte.locator(".post-activite-ou")).toHaveText("Lyon");
  await expect(carte.locator(".post-activite-jour")).toHaveText("21");
  await expect(carte.locator(".post-activite-tuile")).toHaveCSS("background-color", "rgb(193, 61, 40)");
  await expect(carte.locator(".post-activite-photo")).toBeVisible();
  await expect.poll(() => carte.locator(".post-activite-photo").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("carte-activite-fil.png") });
  // Le profil relit les mêmes publications et doit conserver la même carte.
  await page.evaluate(async () => {
    const posts = await supaLoadPosts(0);
    state.userPosts = [];
    state.supabasePosts = posts.map((p) => ({ ...p, authorId: MY_UID }));
    goTo("profiles"); switchProfileTab("all"); renderProfileContent();
  });
  const profil = page.locator("#myPosts .post-activite");
  await expect(profil.locator(".post-activite-photo")).toBeVisible();
  await expect(profil.locator(".post-activite-tuile")).toHaveCSS("background-color", "rgb(193, 61, 40)");
  await expect(profil.locator(".post-activite-titre")).toHaveText(ACTIVITE.title);
}

for (const format of ["texte", "objet"]) {
  test(`carte existante relue (${format}) : photo et bloc corail sans publication source`, async ({ page }) => {
    await bootOnboarded(page);
    await poserSupa(page, { ligne: { ...LIGNE, content: TEXTE_ACTIVITE, event_id: null,
      shared_data: format === "texte" ? JSON.stringify(ACTIVITE) : ACTIVITE } });
    await verifierCarteRelue(page);
  });
}

test("nouveau partage : le vrai envoi conserve le snapshot et la relecture rend la carte", async ({ page }) => {
  await bootOnboarded(page);
  const resultat = await page.evaluate(async (activite) => {
    MY_UID = "9f35913c-0000-4a55-a0b8-000000000001";
    window._supaReal = true;
    window.supaEnsureProfileExists = async () => true;
    supa = {
      auth: { getSession: async () => ({ data: { session: {
        user: { id: MY_UID }, access_token: "synthetic.current.signature",
      } }, error: null }) },
      from(table) {
        if (table !== "posts") throw new Error("Écriture inattendue : " + table);
        return { insert(rows) {
          window.__ligneEcrite = JSON.parse(JSON.stringify(rows[0]));
          const c = { select: () => c, abortSignal: () => c,
            then: (ok, ko) => Promise.resolve({ data: rows, error: null }).then(ok, ko) };
          return c;
        } };
      },
    };
    passioMediaProteges.invalider(MY_UID);
    const post = _postActiviteAuFil(activite, "Auteur", "post_carte_reseau");
    const ok = await window.__vraiSupaPublishPost(post, 1);
    return { ok, ligne: window.__ligneEcrite };
  }, ACTIVITE);
  expect(resultat.ok).toBe(true);
  expect(resultat.ligne.shared_from_post_id).toBeUndefined();
  expect(JSON.parse(resultat.ligne.shared_data)).toMatchObject(ACTIVITE);
  await poserSupa(page, { ligne: { ...LIGNE, ...resultat.ligne } });
  await verifierCarteRelue(page);
});

test("les métadonnées de média et les snapshots invalides ne deviennent pas un repartage", async ({ page }) => {
  await bootOnboarded(page);
  for (const shared_data of ["{invalide", "null", "[]", JSON.stringify({ kind: "event" }),
    JSON.stringify({ kind: "post", id: "source", image: "https://images.example.test/prive.png" }),
    JSON.stringify({ passio_media: { protocol: 1, type: "photo", poster: null } })]) {
    await poserSupa(page, { ligne: { ...LIGNE, shared_data } });
    const r = await page.evaluate(async () => {
      const posts = await supaLoadPosts(0);
      return { n: posts.length, snapshot: posts[0]?.sharedReelData || null, source: posts[0]?.sharedReel || null };
    });
    expect(r).toEqual({ n: 1, snapshot: null, source: null });
  }
});

test("la republication ordinaire conserve sa source et son snapshot", async ({ page }) => {
  await bootOnboarded(page);
  const snapshot = { id: "source", text: "Publication citée", authorName: "Auteur" };
  await poserSupa(page, { ligne: { ...LIGNE, shared_from_post_id: "source", shared_data: JSON.stringify(snapshot) } });
  const relu = await page.evaluate(async () => {
    const [p] = await supaLoadPosts(0);
    return { source: p.sharedReel, snapshot: p.sharedReelData };
  });
  expect(relu).toEqual({ source: "source", snapshot });
});
