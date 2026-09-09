// ══════════════════════════════════════════════════════════════════════════
// L'ENVIE FILTRE LE FIL, ELLE NE LE REMPLIT PAS (2026-09-09)
// ──────────────────────────────────────────────────────────────────────────
// LE DÉFAUT, RAPPORTÉ PAR BENJAMIN APRÈS UN ESSAI RÉEL AVEC UNE TESTEUSE :
// « elle a partagé un post dans musculation, quand je vais dans mon feed son
//   post apparaît alors que je n'ai pas sélectionné la passion en question ;
//   normalement son post apparaît que dans suivis car je n'ai pas cette passion
//   sur mon profil. »
//
// MESURÉ EN PRODUCTION LE JOUR MÊME, et c'est la prémisse EXACTE de cette suite :
//   · la publication portait `passion_id = "fitness-musculation"`, `mood = "learn"` ;
//   · le compte lecteur avait « Suivis » **DÉCOCHÉ** (`feedFollowingOn: false`),
//     `selectedFeedPassions = ["outdoor-randonnee","sante-sport-sante","test5"]`
//     — donc PAS musculation — et `feedIntents = ["learn"]`.
// Rien ne l'amenait dans son fil, qu'un mood partagé. ADR-011 §1 faisait des
// envies une TROISIÈME SOURCE en OU inclusif : cocher « Apprendre » ouvrait le
// fil à TOUT PASSIO. Le fil ne disait donc plus d'où venait ce qu'il montrait.
//
// LA RÈGLE, DÉSORMAIS (amendement d'ADR-011 §1) :
//   SOURCES (OU) : auteur suivi  OU  passion cochée      → CE QUI ENTRE
//   FILTRE  (ET) : envie cochée                          → CE QUI RESTE
// Une envie ne peut que RETRANCHER. Les deux SOURCES, elles, restent additives.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { bootVisiteur } = require("./first-run-helper");

const LEANE = "u_leane";
const MUSCU = "fitness-musculation"; // identifiant RÉEL de la production

// Le compte de Benjamin, tel que la production le portait : deux passions, dont
// AUCUNE n'est la musculation.
async function poser(page, opts = {}) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate((o) => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    window.supaUpsertProfile = async () => {};

    state.seed.users = (state.seed.users || []).filter((u) => u.id !== "u_leane");
    state.seed.users.push({
      id: "u_leane", name: "Léane", profileEmoji: "💪", avatar: "#8b5cf6",
      passion: "fitness-musculation",
    });

    const t = Date.now();
    state.seed.posts = [
      // ⚠️ LA PUBLICATION DU RAPPORT : passion que je n'ai pas, mood « learn ».
      { id: "p_muscu", authorId: "u_leane", passion: "fitness-musculation", type: "text",
        text: "LEANE_MUSCU", mood: "learn", createdAt: t - 1000, likes: 0, comments: [] },
      // Dans MA passion, même mood : elle, elle doit rester quoi qu'il arrive.
      { id: "p_yoga_learn", authorId: "u_autre", passion: "yoga", type: "text",
        text: "MOI_YOGA_LEARN", mood: "learn", createdAt: t - 2000, likes: 0, comments: [] },
      // Dans MA passion, autre mood : c'est elle que l'envie doit retrancher.
      { id: "p_yoga_neutre", authorId: "u_autre", passion: "yoga", type: "text",
        text: "MOI_YOGA_NEUTRE", mood: "all", createdAt: t - 3000, likes: 0, comments: [] },
      // ⚠️ HORS DE TOUTE SOURCE, et porteuse du mood « Rencontrer ». C'est elle
      // qui rend le cas ⑤ MORDANT : tant que l'envie était une source, cocher
      // « Rencontrer » la faisait entrer. Elle ne doit jamais paraître.
      { id: "p_irl_ailleurs", authorId: "u_autre", passion: "photo", type: "text",
        text: "AILLEURS_IRL", mood: "irl", createdAt: t - 4000, likes: 0, comments: [] },
    ];
    state.supabasePosts = [];
    state.userPosts = [];
    // QUATRIÈME tableau : `window._feedExtraPosts` SURVIT aux écrasements de
    // `supabasePosts`. Le vider n'est pas une redondance — sans cela une
    // publication réelle ramenée par un rafraîchissement asynchrone se réinvite
    // dans le fil APRÈS le semis, et le test mesure autre chose que son fixture.
    window._feedExtraPosts = [];

    state.user.name = "Benjamin";
    state.user.general = { username: "Benjamin" };
    state.user.profiles = [
      { id: "pp_yoga", name: "Benjamin", passion: "yoga", emoji: "🧘", color: "#7c3aed", createdAt: 1 },
      { id: "pp_voy", name: "Benjamin", passion: "voyage", emoji: "✈️", color: "#7c3aed", createdAt: 2 },
    ];
    state.user.currentProfileId = "pp_yoga";
    state.user.following = o.suit ? ["u_leane"] : [];

    setFeedPassions(o.passions === undefined ? ["yoga", "voyage"] : o.passions);
    state.feedFollowingOn = !!o.suivis;               // DÉCOCHÉ par défaut, comme en prod
    setFeedIntents(o.envies || []);
    selectedMoods = new Set(["all", "creation", "learn", "chill", "actu"]);
    state.feedMoodsTouched = true;
    saveState();
    window._feedDomSig = null;
    renderFeed();
  }, opts);
  await page.waitForTimeout(300);
}

const filTexte = (page) => page.evaluate(() => document.getElementById("feedList").innerText);
const titreVide = (page) => page.evaluate(() => {
  const t = document.querySelector("#feedEmpty .empty-title");
  const box = document.getElementById("feedEmpty");
  return (box && box.style.display !== "none" && t) ? t.textContent : "";
});

// ══════════════════════════════════════════════════════════════════════════
// ① LE DÉFAUT RAPPORTÉ — l'état exact de la production
// ══════════════════════════════════════════════════════════════════════════

test("① l'envie « Apprendre » n'amène PAS une passion que je n'ai pas", async ({ page }) => {
  await poser(page, { suivis: false, envies: ["learn"] });

  // Prémisse contrôlée : sans le rail d'intentions, les envies ne sont pas
  // consultées et ce cas mesurerait un autre programme.
  expect(await page.evaluate(() => feedIntentsEnabled()),
    "le rail d'intentions doit être actif").toBe(true);
  expect(await page.evaluate(() => feedIntentsSelected()),
    "l'envie du rapport est bien cochée").toEqual(["learn"]);
  expect(await page.evaluate(() => state.feedFollowingOn),
    "« Suivis » est DÉCOCHÉ, comme sur le compte mesuré").toBe(false);
  expect(await page.evaluate((m) => _activeFeedPassions.has(m), MUSCU),
    "et la passion n'est PAS cochée").toBe(false);

  const t = await filTexte(page);
  expect(t, "LE DÉFAUT : la publication d'une passion que je n'ai pas").not.toContain("LEANE_MUSCU");
  expect(t, "ce qui vient de MA passion et satisfait l'envie, lui, reste").toContain("MOI_YOGA_LEARN");
});

test("① bis — le prédicat d'envie est SATISFAIT, et pourtant la carte n'entre pas", async ({ page }) => {
  // ⚠️ CE CAS MESURE LE CÂBLAGE, PAS LE PRÉDICAT. `feedPostMatchesIntent` rend
  // toujours `true` pour cette publication : c'est bien son EMPLOI qui a changé
  // (filtre, plus critère d'entrée). Sans cette distinction, un correctif qui
  // aurait durci le prédicat au lieu de déplacer son point d'application aurait
  // rendu ce fichier vert pour la mauvaise raison — et le défaut serait revenu
  // au premier post « Idées » ou « Rencontrer ».
  await poser(page, { suivis: false, envies: ["learn"] });

  expect(await page.evaluate(() => {
    const p = allFeedPosts().find((x) => x.id === "p_muscu");
    return !!p && feedPostMatchesIntent(p, "learn");
  }), "le prédicat reste vrai : le post EST du « Apprendre »").toBe(true);

  expect(await page.evaluate(() =>
    document.querySelectorAll('#feedList [data-postid="p_muscu"]').length),
    "mais aucune source ne l'amène, donc aucune carte").toBe(0);
});

// ══════════════════════════════════════════════════════════════════════════
// ② LES DEUX SEULES PORTES D'ENTRÉE — et elles marchent toutes les deux
// ══════════════════════════════════════════════════════════════════════════

test("② je coche la passion : la publication arrive dans la bonne passion", async ({ page }) => {
  await poser(page, { suivis: false, envies: ["learn"], passions: ["yoga", MUSCU] });
  expect(await filTexte(page), "cochée, la passion amène son contenu").toContain("LEANE_MUSCU");
});

test("② bis — je ne l'ai pas mais je la suis : elle arrive par « Suivis », et par lui seul", async ({ page }) => {
  await poser(page, { suivis: true, suit: true, envies: [] });
  expect(await page.evaluate((m) => _activeFeedPassions.has(m), MUSCU),
    "la passion reste non cochée").toBe(false);
  expect(await filTexte(page), "« Suivis » est la seconde porte, et la bonne")
    .toContain("LEANE_MUSCU");

  // Décocher « Suivis » la retire : c'est bien LUI qui l'amenait.
  await page.evaluate(() => { setFeedFollowing(false); });
  await page.waitForTimeout(300);
  expect(await filTexte(page)).not.toContain("LEANE_MUSCU");
});

test("② ter — je la suis mais « Suivis » est décoché : rien n'entre", async ({ page }) => {
  // Suivre quelqu'un ne suffit pas : encore faut-il que le critère soit coché.
  // C'est la contrepartie honnête de « Suivis » comme critère (ADR-011 §1).
  await poser(page, { suivis: false, suit: true, envies: [] });
  expect(await filTexte(page)).not.toContain("LEANE_MUSCU");
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LES SOURCES RESTENT ADDITIVES — ce que le correctif ne touche pas
// ══════════════════════════════════════════════════════════════════════════

test("③ « Suivis » + une passion : les deux sources cohabitent (OU inclusif intact)", async ({ page }) => {
  await poser(page, { suivis: true, suit: true, envies: [] });
  const t = await filTexte(page);
  expect(t, "la source « Suivis »").toContain("LEANE_MUSCU");
  expect(t, "la source « passions »").toContain("MOI_YOGA_NEUTRE");
  expect(t, "et la dédup ne mange rien").toContain("MOI_YOGA_LEARN");
});

test("③ bis — l'envie retranche de l'union, sans jamais l'élargir", async ({ page }) => {
  await poser(page, { suivis: true, suit: true, envies: ["learn"] });
  const t = await filTexte(page);
  expect(t, "suivie ET « Apprendre » : elle reste").toContain("LEANE_MUSCU");
  expect(t, "ma passion ET « Apprendre » : elle reste").toContain("MOI_YOGA_LEARN");
  expect(t, "ma passion mais pas « Apprendre » : retranchée").not.toContain("MOI_YOGA_NEUTRE");
});

// ══════════════════════════════════════════════════════════════════════════
// ④ UNE ENVIE SEULE N'EST PAS UNE SÉLECTION
// ══════════════════════════════════════════════════════════════════════════

test("④ aucune source, une envie cochée : fil vide et « Choisis tes passions »", async ({ page }) => {
  await poser(page, { suivis: false, passions: [], envies: ["learn"] });
  expect(await page.evaluate(() => document.querySelectorAll("#feedList .post").length)).toBe(0);
  // ⚠️ Le message doit désigner une SOURCE, jamais l'envie : c'est la source qui
  // manque. `nothingSelected` ne compte donc plus les envies.
  expect(await titreVide(page)).toBe("Choisis tes passions");
});

// ══════════════════════════════════════════════════════════════════════════
// ⑤ QUAND L'ENVIE VIDE L'ÉCRAN, ON LE DIT — et on ne va PAS chercher ailleurs
// ══════════════════════════════════════════════════════════════════════════

test("⑤ l'écran vide nomme l'envie, et ne peint aucune autre passion", async ({ page }) => {
  // Mes sources ont du contenu, mais aucune publication « Rencontrer ».
  await poser(page, { suivis: false, envies: ["meet"] });

  expect(await titreVide(page), "la cause exacte, avec le libellé de l'envie")
    .toBe("Rien en « Rencontrer »");
  // ⚠️ ET SURTOUT : il EXISTE une publication « Rencontrer » sur PASSIO
  // (`AILLEURS_IRL`, passion « photo »). Tant que l'envie était une source,
  // cocher « Rencontrer » la faisait entrer. Elle ne doit plus rien amener.
  expect(await page.evaluate(() =>
    document.querySelectorAll('#feedList [data-postid="p_irl_ailleurs"]').length),
    "une envie n'ouvre aucune passion").toBe(0);

  // ⚠️ LE PIÈGE DU CORRECTIF : le repli d'exploration (§7) annonce « rien encore
  // dans tes passions » et va chercher SIX publications D'AUTRES passions. S'il
  // se déclenchait ici, il rouvrirait par la porte de l'état vide exactement le
  // défaut qu'on vient de fermer.
  const fil = await filTexte(page);
  expect(fil, "aucune publication d'une passion que je n'ai pas").not.toContain("LEANE_MUSCU");
  expect(fil, "ni celle que l'envie aurait amenée du temps où elle était une source")
    .not.toContain("AILLEURS_IRL");
  expect(await page.evaluate(() =>
    document.querySelectorAll("#feedList .feed-repli-tete").length),
    "et pas de repli d'exploration").toBe(0);
});

test("⑤ bis — le repli d'exploration reste vivant quand c'est la PASSION qui est vide", async ({ page }) => {
  // Aucune envie cochée : le vide vient bien des passions, et le repli §7 doit
  // continuer de proposer ses trois issues. Le correctif ne l'a pas emporté.
  await poser(page, { suivis: false, passions: ["cuisine"], envies: [] });
  expect(await page.evaluate(() =>
    document.querySelectorAll("#feedList .feed-repli-tete").length),
    "le repli §7 est intact").toBe(1);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑥ LE VISITEUR SANS COMPTE — le correctif ne doit pas lui fermer la porte
// ══════════════════════════════════════════════════════════════════════════

test("⑥ un visiteur qui coche une envie garde un fil de découverte", async ({ page }) => {
  // ⚠️ CUL-DE-SAC CRÉÉ PAR LE CORRECTIF, ET REFERMÉ AVEC LUI. `filDecouverte`
  // sortait dès qu'une envie était cochée — c'était juste tant qu'une envie
  // était une SOURCE (elle prenait le relais). Depuis qu'elle ne fait que
  // filtrer, sortir sur ce seul geste rendait un fil VIDE à quelqu'un qui n'a
  // encore rien pu choisir.
  await bootVisiteur(page);
  await page.waitForTimeout(600);
  expect(await page.locator("#feedList .post").count(),
    "prémisse : le visiteur voit du contenu").toBeGreaterThan(0);

  await page.evaluate(() => setFeedIntent("learn"));
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => PassioFirstRun.filDecouverte()),
    "l'envie ne ferme pas le fil de découverte").toBe(true);
  expect(await page.locator("#feedList .post").count(),
    "et il reste du contenu à l'écran").toBeGreaterThan(0);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑦ LES LIBELLÉS D'ENVIE NE PEUVENT PAS DIVERGER DE L'ÉCRAN
// ══════════════════════════════════════════════════════════════════════════

test("⑦ PASSIO_FEED_INTENT_LABELS dit exactement ce que les boutons affichent", async ({ page }) => {
  // Le message d'état vide NOMME l'envie. Sa table de libellés est une seconde
  // copie des mots écrits en dur dans `index.html` : deux copies finissent
  // toujours par diverger, et celle-ci mentirait à l'utilisateur au pire moment.
  await poser(page, { suivis: false, envies: [] });
  const vu = await page.evaluate(() => {
    const boutons = {};
    document.querySelectorAll("#feedIntentSelector .feed-intent-btn").forEach((b) => {
      boutons[b.getAttribute("data-intent")] = (b.textContent || "").trim();
    });
    return { boutons, table: PASSIO_FEED_INTENT_LABELS, sources: FEED_INTENT_SOURCES };
  });
  expect(Object.keys(vu.table).sort(), "une entrée par envie sélectionnable")
    .toEqual(vu.sources.slice().sort());
  vu.sources.forEach((cle) => {
    expect(vu.table[cle], `le libellé de « ${cle} »`).toBe(vu.boutons[cle]);
  });
});
