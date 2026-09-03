// Suite « Premier rendu du Fil » — spec §7 du lot Onboarding → premier moment
// de valeur (docs/PASSIO_ONBOARDING_TO_FIRST_VALUE_LOT_2026-08-20.md).
//
// Deux défauts mesurés sur main le 2026-08-23, tous deux invisibles depuis le
// code seul :
//
// ① `selectedMoods` démarre à {"creation"}. Or 4 passions du seed sur 17
//    (yoga, bienetre, cinema, actu) n'avaient AUCUN post de ce mood. Un compte neuf
//    qui choisissait « yoga » voyait « Aucun post pour cette sélection » alors
//    que trois posts yoga existaient — et le bouton "creation", seul mood actif,
//    était grisé avec pointer-events:none : impossible de le décocher. Le fil
//    accusait la sélection de passions d'un vide causé par le mood.
//
// ② 4 passions de la liste officielle (jardinage, jeuxvideo, moto, animaux)
//    n'ont aucun contenu. Le fil s'arrêtait sur « sois le premier à publier
//    ici » — sans aucun moyen de le faire depuis cet écran.
//
// ⚠️ RÉALIGNÉ le 2026-08-28. Le défaut ② est CORRIGÉ à la source : le contenu
// de démonstration couvre désormais les 19 passions, la moins fournie en
// comptant 7. Les tests du repli ne pouvaient donc plus compter sur un trou du
// seed — ils CONSTRUISENT maintenant la condition avec `viderPassion()`, ce qui
// est de toute façon plus honnête : le repli existe pour un compte dont une
// passion est vide, cas qui survient sans trou dans le seed (auteurs bloqués,
// réseau encore sans contenu sur cette passion). Aucune assertion n'a été
// retirée ni affaiblie ; le test ne dépend simplement plus d'un accident de
// données.
//
// Ce que la suite verrouille : la règle absolue (§7) « si du contenu
// correspondant aux passions choisies existe, l'utilisateur ne doit jamais
// atterrir sur un écran vide », le nouveau rail d'intentions qui ne filtre pas
// le fil, le respect du filtre mood quand le kill switch restaure l'interface
// historique, et le repli exploration explicitement étiqueté.
const { test, expect } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");
const { sansDonneesDistantes } = require("./app-helper");

async function bootVierge(page, { v2 = true, uiV2 = true, etat = null } = {}) {
  // ⚠️ CE HELPER FAIT SON PROPRE `goto`, donc l'isolation posée par défaut dans
  // `bootOnboarded` (2026-09-02) ne le couvre pas : la portée est l'APPEL, pas
  // le fichier. Sans cette ligne, la requête `posts` du boot rapporte les vraies
  // publications, et `supaLoadPosts` fait `state.supabasePosts = initPosts` puis
  // `renderFeed()` — ce qui RE-REMPLIT la passion que `viderPassion()` vient de
  // vider, alors que l'écran vide est tout le sujet de cette suite. Neutraliser
  // `supaInit` après le boot arrive trop tard : la requête est déjà partie.
  await sansDonneesDistantes(page);
  await page.addInitScript(([k, t, st, flag, shellV2]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    window.PASSIO_ONBOARDING_V2 = flag;
    if (!shellV2) localStorage.setItem("passio_ui_v2", "0");
    if (st) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    window.__tel = [];
  }, [GATE_KEY, GATE_TOKEN, etat, v2, uiV2]);
  await page.goto("/index.html");
  await page.waitForFunction(() => typeof setFeedPassions === "function", null, { timeout: 20000 });
  await page.evaluate(() => {
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
    window.supaInit = () => {};
    const vrai = (window.tel && window.tel.action) ? window.tel.action.bind(window.tel) : null;
    if (window.tel) {
      window.tel.action = (nom, meta) => { window.__tel.push({ nom, meta }); if (vrai) { try { vrai(nom, meta); } catch (e) {} } };
    }
  });
}

// Vide une passion de TOUT son contenu, dans les trois sources que
// `allFeedPosts()` assemble. À appeler AVANT `terminerOnboarding` : c'est lui
// qui déclenche le premier rendu.
async function viderPassion(page, passion) {
  await page.evaluate((pa) => {
    const sansPa = (l) => (l || []).filter((p) => p.passion !== pa);
    state.seed.posts = sansPa(state.seed.posts);
    state.userPosts = sansPa(state.userPosts);
    state.supabasePosts = sansPa(state.supabasePosts);
    window._feedDomSig = null;   // le guard no-op sauterait le rendu suivant
  }, passion);
}

// Vide une passion de son contenu D'UNE SEULE ENVIE. Le vidage large ci-dessus
// ne convient pas ici : retirer TOUT le yoga déclencherait le repli
// d'exploration, et les tests mesureraient alors autre chose que ce qu'ils
// affirment.
//
// ⚠️ POURQUOI CE HELPER EXISTE (2026-09-02). Trois tests de ce fichier
// reposaient sur un ACCIDENT du socle de démonstration : la case
// « yoga × creation » y était vide, donc `terminerOnboarding(page, "yoga")`
// déclenchait mécaniquement l'élargissement de mood. Ce n'était écrit nulle
// part. Le jour où le socle a comblé cette case — délibérément, parce qu'un
// compte qui cochait yoga + Idées tombait sur un fil vide — les trois tests sont
// devenus rouges sans qu'aucun comportement ne change.
//
// La prémisse « une passion sans contenu de l'envie choisie » appartient au
// FIXTURE, pas au hasard du contenu. Elle est désormais posée explicitement.
async function viderPassionEnvie(page, passion, envie) {
  await page.evaluate(([pa, mo]) => {
    const sans = (l) => (l || []).filter((p) => !(p.passion === pa && p.mood === mo));
    state.seed.posts = sans(state.seed.posts);
    state.userPosts = sans(state.userPosts);
    state.supabasePosts = sans(state.supabasePosts);
    // QUATRIÈME tableau : il survit aux écrasements de `supabasePosts`.
    window._feedExtraPosts = sans(window._feedExtraPosts);
    window._feedDomSig = null;   // le guard no-op sauterait le rendu suivant
  }, [passion, envie]);
}

// Attend que le fil soit ENTIÈREMENT peint. `renderFeed` peint d'abord 12
// cartes puis complète le reste en idle : mesurer tout de suite compte 12 là où
// la passion en a davantage. On attend la condition, jamais une durée.
async function attendreFilComplet(page, attendu) {
  await page.waitForFunction(
    (n) => document.querySelectorAll("#feedList .post").length === n,
    attendu,
    { timeout: 10000 },
  );
}

// Termine l'onboarding sur une passion donnée, comme le fait l'écran « passions ».
async function terminerOnboarding(page, passion) {
  await page.evaluate((pa) => {
    state.user.name = "Testeur";
    state.user.birthYear = 1990;
    selectedPassions.length = 0;
    selectedPassions.push(pa);
    onbFinish();
  }, passion);
}

test("§7 règle absolue — une passion sans post « création » affiche quand même son contenu", async ({ page }) => {
  await bootVierge(page);
  await terminerOnboarding(page, "yoga");

  // Le fil peint 12 cartes puis complète en idle : yoga en a davantage depuis
  // l'enrichissement du contenu de démonstration. On attend la fin du rendu.
  const attendu = await page.evaluate(() =>
    allFeedPosts().filter((p) => p.passion === "yoga" && p.type !== "vlog").length);
  await attendreFilComplet(page, attendu);

  const r = await page.evaluate(() => ({
    postsExistants: allFeedPosts().filter((p) => p.passion === "yoga" && p.type !== "vlog").length,
    moods: Array.from(selectedMoods),
    railMoodMasque: document.querySelector("#moodSelector").hidden,
    railIntentionsVisible: !document.querySelector("#feedIntentSelector").hidden,
    cartes: document.querySelectorAll("#feedList .post").length,
    videAffiche: (document.querySelector("#feedEmpty") || {}).style.display,
  }));

  // Le mood historique reste en mémoire pour le retour arrière, mais le rail
  // d'intentions V2 ne filtre pas : les trois contenus yoga sont visibles.
  expect(r.postsExistants).toBeGreaterThan(0);
  expect(r.moods).toEqual(["creation"]);
  expect(r.railMoodMasque).toBe(true);
  expect(r.railIntentionsVisible).toBe(true);
  // Conclusion : il est à l'écran.
  expect(r.cartes).toBe(r.postsExistants);
  expect(r.videAffiche).toBe("none");
});

test("§7 — le filtre mood réglé par l'utilisateur est respecté, même s'il vide le fil", async ({ page }) => {
  await bootVierge(page, { uiV2: false });
  await viderPassionEnvie(page, "yoga", "creation");
  await terminerOnboarding(page, "yoga");

  const r = await page.evaluate(() => {
    // L'utilisateur règle lui-même les moods : il ne veut que "creation".
    Array.from(selectedMoods).forEach((m) => { if (m !== "creation") toggleMood(m); });
    if (!selectedMoods.has("creation")) toggleMood("creation");
    renderFeed();
    return {
      touched: state.feedMoodsTouched,
      moods: Array.from(selectedMoods),
      cartes: document.querySelectorAll("#feedList .post").length,
      repli: !!document.querySelector("#feedList .feed-repli-tete"),
      titre: (document.querySelector("#feedEmpty .empty-title") || {}).textContent,
    };
  });

  expect(r.touched).toBe(true);
  expect(r.moods).toEqual(["creation"]);
  // Aucun élargissement, aucun repli : le vide est SON choix, on n'y touche pas.
  expect(r.cartes).toBe(0);
  expect(r.repli).toBe(false);
  expect(r.titre).toBe("Aucun post pour cette sélection");
});

test("§7 — l'intention mood survit au rechargement (selectedMoods, lui, repart à zéro)", async ({ page }) => {
  await bootVierge(page, { uiV2: false });
  await terminerOnboarding(page, "yoga");
  await page.evaluate(() => { toggleMood("creation"); });
  await page.waitForTimeout(600); // saveState est débouncé à 250 ms

  await page.reload();
  await page.waitForFunction(() => typeof renderFeed === "function", null, { timeout: 20000 });
  const r = await page.evaluate(() => ({
    touched: state.feedMoodsTouched,
    passions: Array.from(_activeFeedPassions),
  }));
  expect(r.touched).toBe(true);
  expect(r.passions).toEqual(["yoga"]);
});

test("§7 repli — une passion sans contenu propose l'exploration, étiquetée comme telle", async ({ page }) => {
  await bootVierge(page);
  await viderPassion(page, "moto");
  await terminerOnboarding(page, "moto");

  const r = await page.evaluate(() => {
    const l = document.querySelector("#feedList");
    return {
      postsMoto: allFeedPosts().filter((p) => p.passion === "moto").length,
      tete: (l.querySelector(".feed-repli-tete") || {}).textContent || "",
      bandeau: (l.querySelector(".feed-repli-bandeau") || {}).textContent || "",
      cartes: l.querySelectorAll(".feed-repli-carte").length,
      cartesHorsMoto: Array.from(l.querySelectorAll(".feed-repli-carte .post")).length,
      handlers: Array.from(l.querySelectorAll(".feed-repli-actions button")).map((b) => b.getAttribute("onclick")),
      videAffiche: (document.querySelector("#feedEmpty") || {}).style.display,
    };
  });

  expect(r.postsMoto).toBe(0);
  expect(r.tete).toContain("Moto");
  // « Le repli doit rester lisible comme exploration, pas prétendre être une
  // personnalisation exacte » (§7) : le bandeau doit le dire.
  expect(r.bandeau).toContain("Exploration");
  expect(r.bandeau).toContain("pas ton fil personnalisé");
  expect(r.cartes).toBeGreaterThan(0);
  expect(r.cartesHorsMoto).toBe(r.cartes);
  expect(r.videAffiche).toBe("none");
  // Les trois issues de la spec (§7 : personnes, ajouter une passion, publier).
  expect(r.handlers).toEqual(["goTo('profiles')", "goTo('explore')", "goTo('studio')"]);
});

test("§7 repli — les onclick pointent vers des fonctions globales existantes", async ({ page }) => {
  await bootVierge(page);
  await viderPassion(page, "moto");
  await terminerOnboarding(page, "moto");
  const ok = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("#feedList .feed-repli-actions button"));
    return btns.map((b) => {
      const nom = (b.getAttribute("onclick") || "").split("(")[0];
      return { nom, existe: typeof window[nom] === "function" };
    });
  });
  expect(ok.length).toBe(3);
  ok.forEach((h) => expect(h.existe).toBe(true));
});

// Le guard no-op de renderFeed saute la reconstruction quand la signature du
// contenu visible est inchangée ET que la liste a des enfants. Le repli remplit
// la liste : s'il ne réécrit pas `_feedDomSig`, un ALLER-RETOUR (musique → moto
// → musique) revient à la signature d'avant, le guard saute le rendu, et le
// repli reste affiché sur une passion qui a du contenu. C'est cet aller-retour
// qu'il faut jouer — ajouter simplement une passion après le repli ne prouve
// rien, la signature ayant changé de toute façon.
test("§7 repli — un aller-retour ne laisse pas le repli collé à l'écran", async ({ page }) => {
  await bootVierge(page);
  await viderPassion(page, "moto");
  await terminerOnboarding(page, "musique");

  const r = await page.evaluate(() => {
    const lire = () => {
      const l = document.querySelector("#feedList");
      return { repli: !!l.querySelector(".feed-repli-tete"), cartes: l.querySelectorAll(".post").length };
    };
    setFeedPassions(["musique"]); renderFeed();
    const aller = lire();
    setFeedPassions(["moto"]); renderFeed();
    const creux = lire();
    setFeedPassions(["musique"]); renderFeed();   // même signature qu'à l'aller
    const retour = lire();
    return { aller, creux, retour };
  });

  expect(r.aller.repli).toBe(false);
  expect(r.aller.cartes).toBeGreaterThan(0);
  expect(r.creux.repli).toBe(true);
  expect(r.retour.repli).toBe(false);
  expect(r.retour.cartes).toBe(r.aller.cartes);
});

test("§7 — la télémétrie émise survit au filtre PII de js/telemetry.js", async ({ page }) => {
  // Le signal feed_moods_widened appartient au rail historique : on le vérifie
  // explicitement sous le kill switch, tandis que le repli reste commun.
  await bootVierge(page, { uiV2: false });
  await viderPassion(page, "moto");
  await viderPassionEnvie(page, "yoga", "creation");   // la prémisse, posée explicitement
  await terminerOnboarding(page, "yoga");   // déclenche feed_moods_widened
  await page.evaluate(() => { setFeedPassions(["moto"]); renderFeed(); }); // repli

  const noms = await page.evaluate(() => window.__tel.map((e) => e.nom));
  expect(noms).toContain("feed_moods_widened");
  expect(noms).toContain("feed_exploration_fallback");

  // Le filtre est une liste NOIRE : une clé qui matche DENY_KEY disparaît en
  // silence. On rejoue la vraie expression sur les clés réellement envoyées,
  // plutôt que de faire confiance à l'appel (piège vécu avec passion_ctx).
  const src = await page.evaluate(async () => (await fetch("/js/telemetry.js")).text());
  const m = src.match(/DENY_KEY\s*=\s*(\/[\s\S]*?\/[gimsuy]*)\s*[;,\n]/);
  expect(m).not.toBeNull();
  const deny = eval(m[1]);
  const clefs = await page.evaluate(() => {
    const out = [];
    window.__tel.forEach((e) => { Object.keys(e.meta || {}).forEach((k) => out.push(k)); });
    return Array.from(new Set(out));
  });
  clefs.forEach((k) => {
    deny.lastIndex = 0;
    expect({ cle: k, jetee: deny.test(k) }).toEqual({ cle: k, jetee: false });
  });
});

test("§7 — kill switch UI V2 : ancien comportement strictement rétabli", async ({ page }) => {
  await bootVierge(page, { v2: false, uiV2: false });
  await viderPassionEnvie(page, "yoga", "creation");
  await terminerOnboarding(page, "yoga");
  await page.evaluate(() => { setFeedPassions(["yoga"]); renderFeed(); });

  const r = await page.evaluate(() => ({
    moods: Array.from(selectedMoods),
    repli: !!document.querySelector("#feedList .feed-repli-tete"),
    cartes: document.querySelectorAll("#feedList .post").length,
  }));
  expect(r.moods).toEqual(["creation"]);   // aucun élargissement
  expect(r.repli).toBe(false);
  expect(r.cartes).toBe(0);
});
