// AUCUNE PUBLICATION LOCALE OPTIMISTE SANS PASSION CANONIQUE  (2026-08-31)
//
// LE DÉFAUT. Les quatre producteurs — bobine, partage de bobine, partage de post,
// partage d'événement — créaient l'objet dans `state.userPosts` PUIS appelaient
// `supaPublishPostWithRetry`. Le garde central refusait ensuite la passion non
// canonique… mais le post était déjà là : visible chez son auteur, jamais arrivé
// au serveur, perdu au changement d'appareil. Le Studio avait été corrigé ; ces
// quatre-là ne l'étaient pas.
//
// L'INVARIANT : si aucune passion canonique n'est disponible, AUCUNE publication
// locale optimiste n'est créée. Le refus précède la MUTATION, pas seulement la
// requête réseau.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const REFERENTIEL = ["musique","photo","voyage","cuisine","sport","litterature","cinema",
  "tech","art","jardinage","metier","jeuxvideo","yoga","mode","danse","podcast","moto","animaux","actu"];

// Un compte dont TOUTES les passions sont personnelles : `passionParDefautPourPublier()`
// rend `null`, donc aucun repli n'est possible. C'est le seul état qui exerce le garde.
async function bootSansPassionPubliable(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((refs) => {
    window.__toasts = [];
    const vraiToast = window.toast;
    window.toast = function (m) { window.__toasts.push(String(m)); try { return vraiToast.apply(this, arguments); } catch (e) {} };
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
    window.supaPublishPostWithRetry = async () => { window.__envoye = true; return true; };
    window.__envoye = false;
    window.supabase = {
      createClient: () => ({
        from: (t) => ({
          // ⚠️ Chaînable : le vrai PostgREST enchaîne `.not()`, `.in()`, `.order()`…
          // Un double qui ne les expose pas fait lever un TypeError DANS le code
          // testé, et le test échoue pour une raison qui n'a rien à voir.
          select: () => {
            if (t === "passions") return Promise.resolve({ data: refs.map((id) => ({ id })), error: null });
            const q = {
              eq: () => q, in: () => q, not: () => q, neq: () => q, or: () => q,
              order: () => q, limit: () => q, range: () => q, gte: () => q, lte: () => q,
              maybeSingle: async () => ({ data: null, error: null }),
              single: async () => ({ data: null, error: null }),
              then: (f) => Promise.resolve({ data: [], error: null }).then(f),
            };
            return q;
          },
          insert: async () => ({ error: null }),
          upsert: async () => ({ error: null }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();

    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [{ id: "pp_perso", name: "Tricot", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6", createdAt: 1 }];
    state.user.currentProfileId = "pp_perso";
    state.userPosts = [];
    saveState();
  }, REFERENTIEL);
  await page.waitForTimeout(600);   // laisse le référentiel se charger
}

test("prémisse : ce compte n'a AUCUNE passion publiable", async ({ page }) => {
  // Sans cette vérification, les quatre tests suivants pourraient passer parce
  // qu'un repli existait, et non parce que le garde a mordu.
  await bootSansPassionPubliable(page);
  const vu = await page.evaluate(() => ({
    defaut: passionParDefautPourPublier(),
    canonique: estPassionCanonique("custom_tricot_ab12"),
  }));
  expect(vu.defaut).toBe(null);
  expect(vu.canonique).toBe(false);
});

test("bobine : aucun post local orphelin n'est créé", async ({ page }) => {
  await bootSansPassionPubliable(page);
  const vu = await page.evaluate(async () => {
    // ⚠️ `mePublish` branche sur `meState.mode` : « story » part dans une AUTRE
    // voie, qui n'écrit pas dans `state.userPosts`. Une première version de ce
    // test laissait le mode par défaut et voyait donc « 0 post local » — vrai,
    // mais parce qu'aucune BOBINE n'avait jamais été tentée. Le test passait
    // sans rien prouver. On force le mode, et on VÉRIFIE qu'on est bien dedans.
    meState.mode = "bobine";
    meState.mediaType = "video";
    meState.media = "data:video/mp4;base64,AAAA";
    meState.overlays = [];
    meState.details = {};
    meState._enteredEditAt = 0;
    try { await mePublish(); } catch (e) {}
    return { mode: meState.mode, posts: state.userPosts.length, envoye: window.__envoye, toasts: window.__toasts };
  });
  expect(vu.mode, "prémisse : on est bien sur la voie BOBINE").toBe("bobine");
  expect(vu.posts, "aucune bobine locale orpheline").toBe(0);
  expect(vu.envoye, "et rien n'est parti au serveur").toBe(false);
  expect(vu.toasts.join(" "), "l'écran dit quoi faire").toContain("catalogue");
});

test("partage de bobine : aucun post local orphelin", async ({ page }) => {
  await bootSansPassionPubliable(page);
  const vu = await page.evaluate(async () => {
    state.seed.posts.unshift({ id: "reel_src", authorId: "u_x", userId: "u_x", passion: "custom_tricot_ab12",
      type: "video", isReel: true, video: "https://x.test/v.mp4", text: "Écharpe", createdAt: Date.now(), likes: 0, comments: [] });
    try { await shareReelInFeed("reel_src"); } catch (e) {}
    return { posts: state.userPosts.length, toasts: window.__toasts };
  });
  expect(vu.posts).toBe(0);
  expect(vu.toasts.join(" ")).toContain("catalogue");
});

test("partage de post : aucun post local orphelin", async ({ page }) => {
  await bootSansPassionPubliable(page);
  const vu = await page.evaluate(async () => {
    state.seed.posts.unshift({ id: "post_src", authorId: "u_x", userId: "u_x", passion: "custom_tricot_ab12",
      type: "text", text: "Coucou", createdAt: Date.now(), likes: 0, comments: [] });
    try { await sharePostInFeed("post_src"); } catch (e) {}
    return { posts: state.userPosts.length, toasts: window.__toasts };
  });
  expect(vu.posts).toBe(0);
  expect(vu.toasts.join(" ")).toContain("catalogue");
});

test("partage d'événement : aucun post local orphelin", async ({ page }) => {
  await bootSansPassionPubliable(page);
  const vu = await page.evaluate(async () => {
    state.seed.events.unshift({ id: "ev_src", title: "Atelier", passion: "custom_tricot_ab12",
      city: "Annecy", date: Date.now() + 86400000, emoji: "🧶", attendees: [] });
    try { await shareEventInFeed("ev_src"); } catch (e) {}
    return { posts: state.userPosts.length, toasts: window.__toasts };
  });
  expect(vu.posts).toBe(0);
  expect(vu.toasts.join(" ")).toContain("catalogue");
});

test("avec une passion publiable, les quatre producteurs fonctionnent", async ({ page }) => {
  // ⚠️ Le garde ne doit pas être un mur : sans ce test, on ne saurait pas
  // distinguer « il refuse le bon cas » de « il refuse tout ».
  await bootSansPassionPubliable(page);
  const vu = await page.evaluate(async () => {
    state.user.profiles.push({ id: "pp_moto", name: "Moto", passion: "moto", emoji: "🏍️", color: "#7c3aed", createdAt: 2 });
    state.user.currentProfileId = "pp_moto";
    saveState();
    state.seed.posts.unshift({ id: "post_ok", authorId: "u_x", userId: "u_x", passion: "moto",
      type: "text", text: "Balade", createdAt: Date.now(), likes: 0, comments: [] });
    try { await sharePostInFeed("post_ok"); } catch (e) {}
    return { posts: state.userPosts.length, passion: (state.userPosts[0] || {}).passion };
  });
  expect(vu.posts, "le partage aboutit").toBe(1);
  expect(vu.passion).toBe("moto");
});

test("passions personnalisées : la création est fermée, les existantes intactes", async ({ page }) => {
  await bootSansPassionPubliable(page);
  const vu = await page.evaluate(() => {
    const avant = (state.user.customPassions || []).length;
    openCreateCustomPassion();
    const texte = (document.getElementById("modalBody") || document.body).innerText;
    // La grille de l'Explorateur ne propose plus de créer…
    renderExplorer();
    const grille = document.getElementById("allPassions");
    const creerEncore = !!(grille && grille.querySelector(".passion-tile-create"));
    // …mais elle affiche toujours la passion déjà créée.
    const affichee = !!(grille && grille.innerText.indexOf("Tricot") >= 0);
    return { avant, apres: (state.user.customPassions || []).length, texte, creerEncore, affichee };
  });
  expect(vu.texte, "la modale explique, elle ne fait pas semblant").toContain("indisponible");
  expect(vu.creerEncore, "plus aucune tuile de création").toBe(false);
  expect(vu.affichee, "la passion déjà créée reste visible").toBe(true);
  expect(vu.apres, "et rien n'est supprimé").toBe(vu.avant);
});
