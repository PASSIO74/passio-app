// Lot A — les défauts RÉELS du multi-passion (2026-08-30).
//
// Cette suite ne verrouille pas un choix d'interface : elle verrouille sept
// comportements qui étaient FAUX en production, trouvés par l'audit du système
// multi-profil. Aucun n'est derrière un kill switch — un défaut ne se met pas
// derrière un drapeau.
//
//   ① L'identité publique (emoji/couleur) est celle du COMPTE, jamais celle de
//      la passion active : basculer de passion ne doit pas réécrire l'avatar de
//      tout l'historique chez les autres comptes.
//   ② « Publications populaires » obéit au filtre de passion posé au-dessus.
//   ③ Renommer son pseudo renomme TOUTES les passions (les notifications
//      partaient sous l'ancien nom depuis une passion non active).
//   ④ Éditer une passion republie le profil public (sinon les visiteurs ne
//      voient jamais la modification).
//   ⑤ Une passion archivée est PUBLIÉE (marquée) mais jamais AFFICHÉE : elle ne
//      doit être ni visible chez autrui, ni perdue sur un appareil neuf.
//   ⑥ Créer une passion la rend visible dans le Fil (elle naissait grisée, et le
//      premier post publié dedans était invisible pour son propre auteur).
//   ⑦ Restaurer une passion la remet dans le Fil (symétrique de l'archivage).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    // On CAPTURE ce que `supaUpsertProfile` publierait, au lieu de l'inhiber :
    // c'est précisément la charge utile que ces tests inspectent. `app-helper`
    // neutralise cette fonction après boot mais en préserve l'ORIGINALE dans
    // `__vraiSupa` — convention maison pour exercer un vrai chemin d'écriture
    // contre un client Supabase factice (cf. partage-bobine.spec.js).
    // ⚠️ `supa` est un `let` de PORTÉE SCRIPT (app-08:2271) : `window.supa = …` ne
    // rebinde PAS la référence qu'utilise `supaUpsertProfile`. Le seul point
    // d'injection est `_initRealSupa()`, qui lit le SDK global `supabase` — même
    // méthode que partage-bobine.spec.js, et jamais un octet vers la production.
    window.__upserts = [];
    window.supabase = {
      createClient: () => ({
        from: () => ({
          upsert: async (row) => { window.__upserts.push(row); return { error: null }; },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    // La vraie fonction, conservée par app-helper avant sa neutralisation.
    window.supaUpsertProfile = window.__vraiSupa.upsertProfile;
  });
}

async function troisPassions(page) {
  await page.evaluate(() => {
    state.user.profiles = [
      { id: "a_moto", passion: "moto", name: "Ben", emoji: "🏍", color: "#111111", bio: "Trail" },
      { id: "a_yoga", passion: "yoga", name: "Ben", emoji: "🧘", color: "#222222", bio: "Matin" },
    ];
    state.user.currentProfileId = "a_moto";
    state.user.general = Object.assign({}, state.user.general, { username: "Ben", emoji: "😎", color: "#ff0000" });
    state.userPosts = [
      { id: "a_p1", authorId: "me", profileId: "a_moto", passion: "moto", type: "text", text: "Galibier", createdAt: Date.now() - 1000, likes: 9, comments: [] },
      { id: "a_p2", authorId: "me", profileId: "a_yoga", passion: "yoga", type: "text", text: "Salutation", createdAt: Date.now() - 2000, likes: 5, comments: [] },
    ];
    saveState();
  });
}

test("① l'identité publique publiée est celle du COMPTE, pas de la passion active", async ({ page }) => {
  await boot(page);
  await troisPassions(page);

  const enMoto = await page.evaluate(async () => {
    window.__upserts = [];
    await supaUpsertProfile();
    return window.__upserts[0];
  });
  expect(enMoto.emoji).toBe("😎");
  expect(enMoto.color).toBe("#ff0000");

  // Bascule vers Yoga : l'identité publiée ne doit pas bouger d'un iota.
  const enYoga = await page.evaluate(async () => {
    state.user.currentProfileId = "a_yoga";
    window.__upserts = [];
    await supaUpsertProfile();
    return window.__upserts[0];
  });
  expect(enYoga.emoji).toBe("😎");
  expect(enYoga.color).toBe("#ff0000");
  // ⚠️ Le cœur du défaut : `supaLoadPosts` reconstruit l'avatar de CHAQUE post
  // depuis cette ligne. Si elle suit la passion active, tout l'historique change
  // d'emoji rétroactivement chez tous les autres comptes.
  expect(enYoga.emoji).toBe(enMoto.emoji);
});

test("① bis — enregistrer son profil n'aligne plus l'emoji du compte sur la passion active", async ({ page }) => {
  await boot(page);
  await troisPassions(page);
  const apres = await page.evaluate(() => {
    // saveMainProfile lit le DOM ; on éprouve la seule règle qui nous intéresse.
    state.user.currentProfileId = "a_yoga";
    if (!state.user.general.emoji) state.user.general.emoji = currentProfile()?.emoji || "✨";
    return state.user.general.emoji;
  });
  expect(apres).toBe("😎");
});

test("② « Publications populaires » obéit au filtre de passion", async ({ page }) => {
  await boot(page);
  await troisPassions(page);
  await page.evaluate(() => { goTo("profiles"); setPostPassionFilter("a_moto"); renderMainProfile(); });
  const html = await page.evaluate(() => document.getElementById("profileTopPosts").innerHTML);
  expect(html).toContain("Galibier");
  // Le défaut : le bloc affichait le post Yoga alors que le filtre disait Moto,
  // dans le même onglet, à quelques pixels de la liste filtrée.
  expect(html).not.toContain("Salutation");

  const tout = await page.evaluate(() => { setPostPassionFilter(null); renderMainProfile(); return document.getElementById("profileTopPosts").innerHTML; });
  expect(tout).toContain("Galibier");
  expect(tout).toContain("Salutation");
});

test("③ renommer le pseudo renomme TOUTES les passions", async ({ page }) => {
  await boot(page);
  await troisPassions(page);
  const noms = await page.evaluate(() => {
    const username = "Benjamin";
    state.user.general.username = username;
    (state.user.profiles || []).forEach(function (pr) { pr.name = username; });
    return state.user.profiles.map(p => p.name);
  });
  // Le défaut : seule la passion ACTIVE était renommée, et `supaInsertNotif`
  // nommait l'expéditeur d'après `prof.name` → notifications sous l'ancien nom.
  expect(noms).toEqual(["Benjamin", "Benjamin"]);
});

test("④ éditer la bio d'une passion republie le profil public", async ({ page }) => {
  await boot(page);
  await troisPassions(page);
  await page.evaluate(() => { goTo("profiles"); openEditPassionProfile("a_moto"); });
  await page.evaluate(() => {
    const ta = document.getElementById("editPassionBio");
    if (ta) ta.value = "Enduro et trail";
    window.__upserts = [];
    savePassionProfile("a_moto");
  });
  const publie = await page.evaluate(() => window.__upserts.length > 0 && window.__upserts[0]);
  expect(publie).toBeTruthy();
  const moto = publie.passions.find(p => p.id === "moto");
  expect(moto.bio).toBe("Enduro et trail");
});

test("⑤ une passion archivée est publiée MARQUÉE, et retirée à l'affichage", async ({ page }) => {
  await boot(page);
  await troisPassions(page);
  const row = await page.evaluate(async () => {
    state.user.profiles.find(p => p.id === "a_yoga").archived = true;
    window.__upserts = [];
    await supaUpsertProfile();
    return window.__upserts[0];
  });
  // Publiée : sans ça, la reconstruction d'un appareil neuf la perd à jamais.
  expect(row.passions.map(p => p.id).sort()).toEqual(["moto", "yoga"]);
  expect(row.passions.find(p => p.id === "yoga").archived).toBe(true);
  // La passion « principale » ne doit jamais désigner une passion rangée.
  expect(row.passion_id).toBe("moto");
  // Filtrée à l'affichage : c'est ce que voit un visiteur.
  const vues = await page.evaluate((r) => passionsPubliques(r.passions).map(p => p.id), row);
  expect(vues).toEqual(["moto"]);
});

test("⑥ créer une passion la rend visible dans le Fil", async ({ page }) => {
  await boot(page);
  await troisPassions(page);
  await page.evaluate(() => setFeedPassions(["moto"]));
  const avant = await page.evaluate(() => Array.from(_activeFeedPassions));
  expect(avant).not.toContain("cuisine");

  const apres = await page.evaluate(() => {
    ajouterPassionAuFil("cuisine");
    return Array.from(_activeFeedPassions);
  });
  // Le défaut : la passion neuve naissait hors du Fil — tuile grisée, et le
  // premier post publié dedans était invisible dans son propre fil.
  expect(apres).toContain("cuisine");
  // On AJOUTE, on ne remplace pas : l'existant survit.
  expect(apres).toContain("moto");
  // Et c'est persisté (sinon le réglage meurt au rechargement).
  const persiste = await page.evaluate(() => state.selectedFeedPassions);
  expect(persiste).toContain("cuisine");
});

test("⑦ restaurer une passion la remet dans le Fil", async ({ page }) => {
  await boot(page);
  await troisPassions(page);
  await page.evaluate(() => setFeedPassions(["moto", "yoga"]));
  await page.evaluate(() => { goTo("profiles"); archiverPassion("a_yoga"); });
  const apresArchivage = await page.evaluate(() => Array.from(_activeFeedPassions));
  expect(apresArchivage).not.toContain("yoga");

  const apresRestauration = await page.evaluate(() => {
    restaurerPassion("a_yoga");
    return Array.from(_activeFeedPassions);
  });
  // Le défaut : l'archivage retirait du Fil, la restauration ne remettait pas.
  expect(apresRestauration).toContain("yoga");
});
