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
//
// ⚠️ POINTS D'ENTRÉE RÉÉCRITS LE 2026-08-31, assertions conservées. Trois de ces
// tests observaient un `upsert` unique qui republiait tout le profil public à
// chaque appel. Cette opération n'existe plus : la séparation des autorités (P0
// confidentialité) l'a remplacée par `ensure` + des `update` CIBLÉS, précisément
// parce que republier l'identité entière à chaque interaction écrasait les
// données du serveur depuis un appareil sans état local. Les attentes qui
// EXIGEAIENT cette republication sont donc devenues fausses ; celles qui
// portaient sur le RÉSULTAT sont conservées mot pour mot, et deux d'entre elles
// sont renforcées.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { installerFauxProfiles } = require("./faux-profiles");

async function boot(page) {
  await bootOnboarded(page, null, 1, {});
  // Faux client modélisant la table `profiles` (insert + update ciblé + conflit
  // de clé primaire), partagé avec les autres suites qui observent ces écritures.
  await page.evaluate(installerFauxProfiles);
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
    await supaEnsureProfileExists();
    return Object.assign({}, window.__rows.find(r => r.id === window.__uid));
  });
  // ⚠️ ATTENTE RÉÉCRITE. Elle exigeait l'emoji et la couleur du COMPTE
  // (« 😎 », « #ff0000 »), donc que chaque appel republie l'identité locale
  // par-dessus le serveur — le défaut même que la séparation des autorités a
  // fermé. Ce qui compte n'a jamais été QUELLE valeur est publiée, mais qu'elle
  // ne soit pas celle de la passion ACTIVE.
  expect(enMoto.emoji, "l'emoji publié n'est pas celui de la passion active").not.toBe("🏍");
  expect(enMoto.color).not.toBe("#111111");

  // Bascule vers Yoga : l'identité publiée ne doit pas bouger d'un iota.
  const enYoga = await page.evaluate(async () => {
    state.user.currentProfileId = "a_yoga";
    await supaEnsureProfileExists();
    return Object.assign({}, window.__rows.find(r => r.id === window.__uid));
  });
  expect(enYoga.emoji).not.toBe("🧘");
  expect(enYoga.color).not.toBe("#222222");
  // ⚠️ Le cœur du défaut : `supaLoadPosts` reconstruit l'avatar de CHAQUE post
  // depuis cette ligne. Si elle suit la passion active, tout l'historique change
  // d'emoji rétroactivement chez tous les autres comptes.
  expect(enYoga.emoji).toBe(enMoto.emoji);
  expect(enYoga.color).toBe(enMoto.color);
  // ⚠️ ASSERTION AJOUTÉE, plus forte que la comparaison ci-dessus : AUCUNE
  // écriture ne porte l'identité visuelle. Deux valeurs égales ne prouvent que
  // l'égalité ; on exige ici qu'aucun chemin ne la republie du tout.
  const champs = await page.evaluate(() =>
    window.__updates.filter(u => u.table === "profiles").flatMap(u => Object.keys(u.patch)));
  expect(champs).not.toContain("emoji");
  expect(champs).not.toContain("color");
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
    window.__updates = [];
    savePassionProfile("a_moto");
  });
  await page.waitForTimeout(400);
  // ⚠️ La republication passe désormais par `supaSavePassionState`, qui n'écrit
  // QUE `passions` et `passion_id` — pas par un upsert du profil entier. Le
  // résultat exigé est le même : le visiteur doit voir la bio modifiée.
  const publie = await page.evaluate(() =>
    (window.__updates.filter(u => u.table === "profiles" && u.patch.passions).pop() || {}).patch);
  expect(publie, "éditer une passion doit republier la liste des passions").toBeTruthy();
  const moto = publie.passions.find(p => p.id === "moto");
  expect(moto.bio).toBe("Enduro et trail");
  // ⚠️ ASSERTION AJOUTÉE : republier une passion ne doit RIEN écrire d'autre.
  // C'est le tout de la séparation des autorités — changer une bio de passion
  // n'est pas une autorisation d'écraser le pseudo ou la confidentialité.
  expect(Object.keys(publie).sort()).toEqual(["passion_id", "passions"]);
});

test("⑤ une passion archivée est publiée MARQUÉE, et retirée à l'affichage", async ({ page }) => {
  await boot(page);
  await troisPassions(page);
  const row = await page.evaluate(async () => {
    state.user.profiles.find(p => p.id === "a_yoga").archived = true;
    window.__updates = [];
    // L'état des passions a sa propre opération : c'est elle qui les publie.
    await supaSavePassionState();
    return (window.__updates.filter(u => u.table === "profiles" && u.patch.passions).pop() || {}).patch;
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

// ════════════════════════════════════════════════════════════════════════════
// VERROUS AJOUTÉS LE 2026-08-31, après deux régressions de FUSION
// ════════════════════════════════════════════════════════════════════════════

test("⑧ éditer une passion PUBLIE vraiment : aucun chemin ne retombe sur `ensure`", async ({ page }) => {
  // ⚠️ RÉGRESSION RÉELLE, trouvée en réparant le run 2342. Quatre chemins
  // d'app-06 — photo, couverture, retrait de couverture, bio — appelaient
  // `supaUpsertProfile()`. Ce nom a cessé de désigner la même chose : depuis la
  // séparation des autorités, ce n'est plus qu'un ALIAS d'`ensure`, qui n'écrit
  // AUCUN champ d'une ligne existante. Les quatre étaient donc devenus des
  // no-op silencieux — l'appel présent, la fonction existante, l'écriture
  // jamais partie. La carte de passion vue par un VISITEUR ne bougeait plus.
  //
  // Ce test vise le RÉSULTAT (la liste des passions atteint la base), jamais le
  // nom de la fonction appelée : un verrou qui vérifierait « `supaUpsertProfile`
  // n'est plus appelée » resterait vert le jour où un cinquième chemin
  // oublierait de publier tout court.
  await boot(page);
  await troisPassions(page);
  await page.evaluate(() => { goTo("profiles"); openEditPassionProfile("a_moto"); });
  await page.evaluate(() => {
    const ta = document.getElementById("editPassionBio");
    if (ta) ta.value = "Col du Galibier";
    window.__updates = [];
    savePassionProfile("a_moto");
  });
  await page.waitForTimeout(500);
  const vu = await page.evaluate(() =>
    (window.__rows.find(r => r.id === window.__uid) || {}).passions || []);
  const moto = vu.find(p => p.id === "moto");
  expect(moto, "la liste des passions doit avoir atteint la base").toBeTruthy();
  expect(moto.bio, "la bio éditée est visible d'un visiteur").toBe("Col du Galibier");
});

test("⑨ la passion principale se CHOISIT, elle ne se normalise pas", async ({ page }) => {
  // ⚠️ RÉGRESSION RÉELLE, mesurée au run 2342. La fusion avait remplacé le choix
  // de la passion principale par `optionalCanonicalPassion(première vivante)`,
  // avec le commentaire « même effet, une seule règle ». Les deux écritures ne
  // répondent pas à la même question : normaliser la PREMIÈRE rend `null` dès
  // qu'elle n'est pas canonique, alors que PARCOURIR la liste trouve la suivante
  // qui l'est. Un compte portant une passion perso puis une canonique perdait
  // donc son classement public — sans erreur, sans rien à l'écran.
  await boot(page);

  const cas = await page.evaluate(async () => {
    const essai = async (profiles) => {
      state.user.customPassions = [{ id: "custom_tricot_ab12", emoji: "🧶", label: "Tricot", custom: true }];
      state.user.profiles = profiles;
      state.user.currentProfileId = profiles[0].id;
      saveState();
      window.__updates = [];
      await supaSavePassionState();
      const u = window.__updates.filter(x => x.table === "profiles" && "passion_id" in x.patch).pop();
      return u ? u.patch.passion_id : "AUCUNE-ÉCRITURE";
    };
    return {
      // Une perso devant une canonique : c'est la canonique qui représente le compte.
      persoPuisCanonique: await essai([
        { id: "x1", passion: "custom_tricot_ab12", name: "Ben" },
        { id: "x2", passion: "yoga", name: "Ben" },
      ]),
      // Une archivée devant une vivante : la principale est VIVANTE.
      archiveePuisVivante: await essai([
        { id: "y1", passion: "moto", name: "Ben", archived: true },
        { id: "y2", passion: "yoga", name: "Ben" },
      ]),
      // Toutes archivées : mieux vaut une catégorie choisie par le compte que `null`.
      toutesArchivees: await essai([
        { id: "z1", passion: "moto", name: "Ben", archived: true },
      ]),
      // Aucune canonique : `null`, et surtout pas une passion inventée.
      aucuneCanonique: await essai([
        { id: "w1", passion: "custom_tricot_ab12", name: "Ben" },
      ]),
    };
  });

  expect(cas.persoPuisCanonique, "parcourir la liste, ne pas normaliser la première").toBe("yoga");
  expect(cas.archiveePuisVivante, "la principale ne désigne pas une passion rangée").toBe("yoga");
  expect(cas.toutesArchivees, "plutôt une catégorie choisie que null").toBe("moto");
  expect(cas.aucuneCanonique, "aucune passion canonique : null, jamais une valeur inventée").toBe(null);
});
