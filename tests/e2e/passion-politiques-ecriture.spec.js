// ADR-010 — une classification commune, DEUX politiques par type d'objet.
//
// La clé étrangère `passion_id → passions(id)` est la même sur les cinq tables ;
// l'invariant PRODUIT, lui, ne l'est pas :
//
//   · `posts` et `events` sont en politique OBLIGATOIRE — ni `null`, ni valeur
//     hors référentiel : on BLOQUE avant la requête ;
//   · `profiles`, `stories` et les trois formes de `conversations` sont en
//     politique FACULTATIVE — l'objet a une raison d'exister indépendante de son
//     classement, donc une valeur hors référentiel est normalisée en `null`
//     plutôt que de faire refuser TOUTE l'écriture.
//
// Ce que cette suite prouve : AUCUNE des cinq tables ne reçoit jamais une valeur
// que la clé étrangère refuserait. Elle capture les charges réellement envoyées
// au SDK — elle ne relit pas la logique, elle l'exerce.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Passion personnalisée telle que l'interface la fabrique (app-02
// `confirmCreateCustomPassion`) : préfixe `custom_`, drapeau `custom: true`.
const PERSO = { id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true };

// Installe un SDK factice qui ENREGISTRE chaque écriture, table par table, puis
// répond succès. Les vraies fonctions d'écriture sont restaurées : on exerce le
// code de production, pas une reformulation.
async function boot(page, opts = {}) {
  // ⚠️ CONVENTION DE TEST — la même qu'aux mises en ligne d'UI-3A, UI-4 et UI-8.
  // Le lot `flat_passions_v1` (actif par défaut depuis le 2026-09-01) recouvre
  // la surface qu'observe cette suite : `openCreateProfile` mène désormais au
  // sélecteur de recherche, et `#newProfileGrid` n'existe plus. Elle pose donc
  // le kill switch du lot et GARDE TOUTES SES ASSERTIONS.
  await page.addInitScript(() => localStorage.setItem("flat_passions_v1", "0"));
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((o) => {
    window.__ecrits = { posts: [], profiles: [], stories: [], events: [], conversations: [], conv_members: [] };
    const note = (t, payload) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      (window.__ecrits[t] = window.__ecrits[t] || []).push(...rows);
    };
    const reponse = { data: [{ id: "x" }], error: null };
    window.supabase = {
      createClient: () => ({
        from: (t) => ({
          select: (...a) => {
            // Le référentiel : le SDK factice sert exactement les identifiants demandés.
            if (t === "passions") return Promise.resolve({ data: (o.referentiel || []).map((id) => ({ id })), error: null });
            const q = {
              eq: () => q, in: () => q, order: () => q, limit: () => q, neq: () => q,
              maybeSingle: async () => ({ data: null, error: null }),
              then: (f) => Promise.resolve({ data: [], error: null }).then(f),
            };
            return q;
          },
          insert: (p) => { note(t, p); const r = Promise.resolve(reponse); r.select = () => Promise.resolve(reponse); return r; },
          upsert: (p) => { note(t, p); return Promise.resolve(reponse); },
          update: (p) => { note(t, p); const q = { eq: () => q, select: async () => reponse, then: (f) => Promise.resolve(reponse).then(f) }; return q; },
          delete: () => { const q = { eq: () => q, then: (f) => Promise.resolve(reponse).then(f) }; return q; },
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    // Restaure les VRAIS points d'écriture, neutralisés par `app-helper`.
    window.supaPublishPostWithRetry = window.__vraiSupa.publishPost;
    window.supaUpsertProfile = window.__vraiSupa.upsertProfile;
    window.MY_UID = "uid_test";
  }, opts);
  // Laisse le chargement d'arrière-plan du référentiel répondre.
  await page.waitForTimeout(600);
}

// Le référentiel serveur des tests : les 19 identifiants réels, sans « tricot ».
const REFERENTIEL = ["musique","photo","voyage","cuisine","sport","litterature","cinema",
  "tech","art","jardinage","metier","jeuxvideo","yoga","mode","danse","podcast","moto","animaux","actu"];

// ════════════════════════════════════════════════════════════════════════════
// POLITIQUE OBLIGATOIRE — `posts`
// Chemin d'écriture : `supaPublishPostWithRetry` (point CENTRAL : Studio,
// bobine, partage d'événement et repartages y aboutissent tous).
// Dans l'interface : la passion est obligatoire (le `<select>` est toujours
// peuplé et présélectionné). Comportement retenu : refus AVANT la requête.
// ════════════════════════════════════════════════════════════════════════════

test("posts ① une passion hors référentiel ne part JAMAIS — refus avant la requête", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(async () => {
    const ok = await supaPublishPostWithRetry({
      id: "p_perso", passion: "custom_tricot_ab12", mood: "all",
      text: "Mon écharpe", type: "text", createdAt: Date.now(),
    });
    return { ok, posts: window.__ecrits.posts, cause: window._passioEchecPublication };
  });

  expect(vu.ok, "la publication doit échouer franchement").toBe(false);
  // Le point décisif : PAS d'insert du tout. Envoyer puis encaisser le 23503,
  // c'est ce que faisait l'ancien code — et l'utilisateur lisait « connexion
  // lente » pour une erreur de données (docs/PASSION_PERSONNALISEE_FK…§3).
  expect(vu.posts, "aucune ligne ne doit être envoyée à `posts`").toEqual([]);
  expect(vu.cause).toBe("passion_inconnue");
});

test("posts ② une passion absente est refusée elle aussi, avec une cause distincte", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(async () => {
    const ok = await supaPublishPostWithRetry({ id: "p_nul", passion: null, mood: "all", text: "x", type: "text", createdAt: Date.now() });
    return { ok, posts: window.__ecrits.posts, cause: window._passioEchecPublication };
  });

  expect(vu.ok).toBe(false);
  expect(vu.posts).toEqual([]);
  // Deux causes distinctes, parce que les deux gestes à faire le sont aussi :
  // « choisis une passion » ≠ « celle-ci n'existe que chez toi ».
  expect(vu.cause).toBe("passion_absente");
});

test("posts ③ une passion canonique part telle quelle, sans repli ni réécriture", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(async () => {
    const ok = await supaPublishPostWithRetry({ id: "p_ok", passion: "moto", mood: "all", text: "Balade", type: "text", createdAt: Date.now() });
    return { ok, posts: window.__ecrits.posts, cause: window._passioEchecPublication };
  });

  expect(vu.ok).toBe(true);
  expect(vu.posts.length).toBe(1);
  expect(vu.posts[0].passion_id).toBe("moto");
  expect(vu.cause).toBe(null);
});

test("posts ④ appareil neuf : le drapeau `custom` a disparu, la passion reste refusée", async ({ page }) => {
  // ⚠️ LE cas qui interdit de se fier à `custom: true`. La reconstruction du boot
  // rebâtit les profils depuis le jsonb `profiles.passions`, qui ne porte PAS ce
  // drapeau : sur un téléphone neuf, une passion personnalisée est indiscernable
  // d'une canonique si on l'interroge par son drapeau. La liste blanche, elle,
  // la refuse dans les deux cas. Le préfixe `custom_` ne sauverait pas non plus :
  // il ne couvre ni « autre », ni « test », ni la chaîne vide.
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(async () => {
    // Aucun `customPassions` : le stockage local a été perdu.
    state.user.customPassions = [];
    state.user.profiles = [{ id: "pp_perso", name: "Tricot", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6", createdAt: 1 }];
    state.user.currentProfileId = "pp_perso";

    const res = {
      drapeauPresent: !!(allPassions().find((p) => p.id === "custom_tricot_ab12") || {}).custom,
      canonique: estPassionCanonique("custom_tricot_ab12"),
      autre: estPassionCanonique("autre"),
      test: estPassionCanonique("test"),
      vide: estPassionCanonique(""),
    };
    res.ok = await supaPublishPostWithRetry({ id: "p2", passion: "custom_tricot_ab12", mood: "all", text: "x", type: "text", createdAt: Date.now() });
    res.posts = window.__ecrits.posts.length;
    return res;
  });

  expect(vu.drapeauPresent, "le drapeau a bien disparu — c'est la prémisse du cas").toBe(false);
  expect(vu.canonique).toBe(false);
  expect(vu.autre, "la valeur fantôme « autre » n'est dans aucun des 19 identifiants").toBe(false);
  expect(vu.test).toBe(false);
  expect(vu.vide).toBe(false);
  expect(vu.ok).toBe(false);
  expect(vu.posts).toBe(0);
});

// ════════════════════════════════════════════════════════════════════════════
// POLITIQUE OBLIGATOIRE — `events`
// Chemin d'écriture : `supaPublishEvent` et `supaUpdateEvent`.
// Dans l'interface : déjà obligatoire (`submitEvent` refuse une passion vide).
// Comportement retenu : refus avant la requête, aux DEUX points d'écriture.
// ════════════════════════════════════════════════════════════════════════════

test("events ⑤ création et édition refusent une passion hors référentiel", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(async () => {
    const ev = { id: "ev_perso", title: "Atelier tricot", passion: "custom_tricot_ab12", city: "Annecy", date: Date.now() + 86400000 };
    const cree = await supaPublishEvent(ev);
    const edite = await supaUpdateEvent(ev);
    const evOk = await supaPublishEvent(Object.assign({}, ev, { id: "ev_ok", passion: "moto" }));
    return { cree, edite, evOk, events: window.__ecrits.events };
  });

  expect(vu.cree, "la création doit échouer").toBe(false);
  expect(vu.edite, "l'édition aussi — c'est un second point d'écriture").toBe(false);
  expect(vu.evOk).toBe(true);
  // Une seule ligne envoyée : celle en « moto ».
  expect(vu.events.length).toBe(1);
  expect(vu.events[0].passion_id).toBe("moto");
});

// ════════════════════════════════════════════════════════════════════════════
// POLITIQUE FACULTATIVE — `profiles`, `stories`, `conversations`
// Comportement retenu : `null` à la place de la valeur refusée, et l'écriture
// ABOUTIT. Refuser ici punirait l'objet pour un classement dont il n'a pas
// besoin — et, pour `profiles`, coupait tout le profil public (P0 2026-08-30).
// ════════════════════════════════════════════════════════════════════════════

test("profiles ⑥ une passion personnelle n'empêche plus le profil public de partir", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(async () => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [{ id: "pp_perso", name: "Tricot", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6", createdAt: 1 }];
    state.user.currentProfileId = "pp_perso";
    state.user.general = { username: "Benjamin", emoji: "🎵", color: "#7c3aed", bio: "Salut" };
    // ⚠️ POINT D'ENTRÉE RÉÉCRIT LE 2026-08-31, assertions conservées. Publier le
    // profil public n'est plus UN upsert mais TROIS opérations d'autorités
    // distinctes — c'est la correction du P0 confidentialité : republier tout à
    // chaque appel écrasait l'identité serveur depuis un appareil sans état
    // local. Le test exerce donc les trois, et vérifie le même RÉSULTAT :
    // l'ensemble du profil public atteint la base malgré la passion invalide.
    await supaEnsureProfileExists();
    await supaSavePublicProfile({ username: "Benjamin", bio: "Salut" });
    await supaSavePassionState();
    return window.__ecrits.profiles;
  });

  // La ligne d'écriture aboutit, elle n'est pas refusée. On la reconstitue :
  // c'est l'état que le serveur porterait au bout des trois opérations.
  expect(vu.length, "les écritures doivent aboutir, pas être refusées").toBeGreaterThan(0);
  const ligne = Object.assign({}, ...vu);
  // La FK est respectée…
  expect(ligne.passion_id).toBe(null);
  // …et TOUT le reste du profil public arrive quand même. C'est l'enjeu réel :
  // sans ça, pseudo, avatar, bio et liste des passions n'atteignaient personne.
  expect(ligne.username).toBe("Benjamin");
  expect(ligne.bio).toBe("Salut");
  expect(Array.isArray(ligne.passions)).toBe(true);
  // La passion personnelle reste PUBLIÉE dans la liste jsonb : elle n'est pas
  // une clé étrangère là-dedans, et l'effacer perdrait le rangement de son
  // propriétaire au premier changement d'appareil.
  expect(ligne.passions.map((p) => p.id)).toContain("custom_tricot_ab12");
});

test("stories ⑦ et conversations ⑧ : normalisées en `null`, jamais refusées", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(async () => {
    await supaPublishStory({ id: "st_1", passion: "custom_tricot_ab12", text: "Coucou", emoji: "🧶" });
    await supaCreateGroup("Les tricoteuses", ["uid_autre"], "custom_tricot_ab12");
    await supaCreateEventConversation({ id: "ev_1", title: "Atelier", passion: "custom_tricot_ab12" });
    await supaCreateConversation("uid_autre");
    return { stories: window.__ecrits.stories, conversations: window.__ecrits.conversations };
  });

  expect(vu.stories.length, "la story doit être publiée").toBe(1);
  expect(vu.stories[0].passion_id).toBe(null);
  expect(vu.stories[0].content, "et garder son contenu").toBe("Coucou");

  expect(vu.conversations.length, "les trois formes de conversation doivent être créées").toBe(3);
  // Aucune des trois ne porte de valeur que la clé étrangère refuserait.
  vu.conversations.forEach((c) => expect(c.passion_id).toBe(null));
  expect(vu.conversations.find((c) => c.group_name === "Les tricoteuses")).toBeTruthy();
});

// ════════════════════════════════════════════════════════════════════════════
// SORTIE A — on ne PROPOSE plus ce qui ne peut pas aboutir
// (docs/PASSION_PERSONNALISEE_FK_2026-08-30.md). Un garde qui refuse un geste
// que l'interface offre encore est une impasse, pas un correctif.
// ════════════════════════════════════════════════════════════════════════════

test("sortie A ⑨ la grille « Nouvelle passion » n'offre que des passions publiables", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(() => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [{ id: "pp_0", name: "Moto", passion: "moto", emoji: "🏍️", color: "#7c3aed", createdAt: 1 }];
    openCreateProfile();
    const tuiles = [...document.querySelectorAll("#newProfileGrid .passion-tile")];
    return {
      ids: tuiles.map((t) => t.getAttribute("data-passion")).filter(Boolean),
      creerEncore: tuiles.some((t) => t.classList.contains("passion-tile-create")),
      // La passion personnelle n'est PAS supprimée pour autant.
      toujoursEnEtat: !!allPassions().find((p) => p.id === "custom_tricot_ab12"),
    };
  });

  expect(vu.ids).not.toContain("custom_tricot_ab12");
  expect(vu.ids, "les passions du catalogue restent proposées").toContain("yoga");
  // La tuile « ＋ Créer » menait à une passion que cette grille filtre désormais :
  // le geste aurait été suivi d'une disparition silencieuse.
  expect(vu.creerEncore, "plus de porte vers une création qui n'aboutit pas ici").toBe(false);
  expect(vu.toujoursEnEtat, "aucune passion personnalisée n'est supprimée").toBe(true);
});

test("sortie A ⑩ le Studio n'offre pas de publier dans une passion personnelle, et le dit", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(() => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [
      { id: "pp_0", name: "Moto", passion: "moto", emoji: "🏍️", color: "#7c3aed", createdAt: 1 },
      { id: "pp_perso", name: "Tricot", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6", createdAt: 2 },
    ];
    renderStudio();
    const sel = document.getElementById("postPassion");
    const note = document.getElementById("studioPassionNote");
    return {
      options: [...sel.options].map((o) => o.value),
      note: (note.textContent || "").trim(),
      noteVisible: note.style.display !== "none",
    };
  });

  expect(vu.options).toEqual(["moto"]);
  expect(vu.noteVisible, "l'écran doit expliquer ce qui manque").toBe(true);
  expect(vu.note.length).toBeGreaterThan(10);
});

test("sortie A ⑪ rien n'est écarté : aucune ligne d'explication inutile", async ({ page }) => {
  // Le message ne doit apparaître QUE s'il a une raison d'être — l'immense
  // majorité des comptes n'a aucune passion personnalisée.
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(() => {
    state.user.customPassions = [];
    state.user.profiles = [{ id: "pp_0", name: "Moto", passion: "moto", emoji: "🏍️", color: "#7c3aed", createdAt: 1 }];
    renderStudio();
    const note = document.getElementById("studioPassionNote");
    return { visible: note.style.display !== "none", texte: (note.textContent || "").trim() };
  });

  expect(vu.visible).toBe(false);
  expect(vu.texte).toBe("");
});

// ════════════════════════════════════════════════════════════════════════════
// REPARTAGE — le partage est MA publication : il n'hérite jamais d'un
// classement qui ferait refuser son propre envoi.
// ════════════════════════════════════════════════════════════════════════════

test("repartage ⑫ hérite du classement de la source, ou du mien s'il ne peut pas partir", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(() => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [{ id: "pp_0", name: "Moto", passion: "moto", emoji: "🏍️", color: "#7c3aed", createdAt: 1 }];
    state.user.currentProfileId = "pp_0";
    return {
      canonique: passionDeRepartage("yoga"),      // la source décide…
      perso: passionDeRepartage("custom_tricot_ab12"), // …sauf si elle ne peut pas partir
      absente: passionDeRepartage(null),
      fantome: passionDeRepartage("autre"),
    };
  });

  expect(vu.canonique).toBe("yoga");
  expect(vu.perso).toBe("moto");
  expect(vu.absente).toBe("moto");
  expect(vu.fantome).toBe("moto");
});

test("repartage ⑬ un compte sans aucune passion publiable renonce, il n'invente pas", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(() => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [{ id: "pp_perso", name: "Tricot", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6", createdAt: 1 }];
    state.user.currentProfileId = "pp_perso";
    return { defaut: passionParDefautPourPublier(), repartage: passionDeRepartage(null) };
  });

  // `null` fait refuser la publication — franchement, avec un message qui dit
  // quoi faire. C'est mieux qu'un classement inventé dans une passion que la
  // personne n'a pas choisie.
  expect(vu.defaut).toBe(null);
  expect(vu.repartage).toBe(null);
});

// ════════════════════════════════════════════════════════════════════════════
// L'IMPASSE DU STUDIO — un compte dont AUCUNE passion n'est publiable.
// Trouvée le 2026-08-31 en relisant le code : la sortie A retirait ces passions
// du `<select>`, qui se retrouvait VIDE ; `publishPost` lisait `""`, créait le
// post EN LOCAL, puis le garde central le refusait. Un post visible chez son
// auteur, jamais parti, perdu au changement d'appareil — la perte silencieuse
// même que ce chantier ferme.
// ════════════════════════════════════════════════════════════════════════════

async function posercompteSansPassionPubliable(page) {
  return page.evaluate(() => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [{ id: "pp_perso", name: "Tricot", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6", createdAt: 1 }];
    state.user.currentProfileId = "pp_perso";
    goTo("studio");
    renderStudio();
  });
}

test("impasse ⑭ aucune passion publiable : AUCUN post local orphelin n'est créé", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });
  await posercompteSansPassionPubliable(page);

  const vu = await page.evaluate(async () => {
    const toasts = [];
    const vrai = window.toast;
    window.toast = (m) => { toasts.push(String(m)); };
    document.getElementById("postText").value = "Mon écharpe avance bien";
    const avant = (state.userPosts || []).length;
    await publishPost();
    window.toast = vrai;
    return {
      avant, apres: (state.userPosts || []).length,
      posts: window.__ecrits.posts.length,
      options: [...document.getElementById("postPassion").options].map((o) => o.value),
      toasts,
    };
  });

  expect(vu.options, "le select est bien vide — c'est la prémisse de l'impasse").toEqual([]);
  // LE point : rien n'est créé localement. L'ancien chemin en créait un.
  expect(vu.apres, "aucun post orphelin dans l'état local").toBe(vu.avant);
  expect(vu.posts, "et rien n'est envoyé non plus").toBe(0);
  // Et le message nomme la SORTIE, au lieu de demander de choisir dans un vide.
  const m = vu.toasts.join(" | ");
  expect(m).toContain("Ajoute une passion du catalogue");
});

test("impasse ⑮ le Studio nomme la sortie, et propose la porte", async ({ page }) => {
  await boot(page, { referentiel: REFERENTIEL });
  await posercompteSansPassionPubliable(page);

  const vu = await page.evaluate(() => {
    const n = document.getElementById("studioPassionNote");
    return { visible: n.style.display !== "none", texte: n.textContent || "", lien: !!n.querySelector("a") };
  });

  expect(vu.visible).toBe(true);
  expect(vu.texte).toContain("Ajoute une passion du catalogue");
  expect(vu.lien, "une impasse doit offrir la porte, pas seulement la décrire").toBe(true);
});

test("impasse ⑯ une passion publiable existe : le message reste l'information, pas l'alerte", async ({ page }) => {
  // La distinction compte : « certaines sont écartées » n'est pas une impasse.
  await boot(page, { referentiel: REFERENTIEL });

  const vu = await page.evaluate(() => {
    state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", color: "#8b5cf6", custom: true }];
    state.user.profiles = [
      { id: "pp_0", name: "Moto", passion: "moto", emoji: "🏍️", color: "#7c3aed", createdAt: 1 },
      { id: "pp_perso", name: "Tricot", passion: "custom_tricot_ab12", emoji: "🧶", color: "#8b5cf6", createdAt: 2 },
    ];
    goTo("studio");
    renderStudio();
    const n = document.getElementById("studioPassionNote");
    return { texte: n.textContent || "", lien: !!n.querySelector("a") };
  });

  expect(vu.texte).not.toContain("Ajoute une passion du catalogue");
  expect(vu.lien).toBe(false);
});
