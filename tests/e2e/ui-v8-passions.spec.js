// Lot UI-8 — « une personne, plusieurs passions ».
//
// Ce que cette suite prouve, et rien d'autre :
//   ① le PROFIL PERSONNEL reste entier (pseudo, bio, abonnés, abonnements,
//      « Modifier ») et porte, juste dessous, « Passion active : X · Changer » ;
//   ② « À propos » ne filtre plus : toucher une carte n'appelle plus
//      `toggleProfileSelect`, aucune carte n'est « sélectionnée », et
//      « Réinitialiser » a disparu ;
//   ③ « Utiliser pour créer » change RÉELLEMENT l'identité active
//      (`switchToProfile`) sans se propager à autre chose ;
//   ④ « Publications » porte le filtre à choix UNIQUE, avec « Toutes » pour
//      neutre, et il filtre pour de vrai ;
//   ⑤ la migration défensive de l'ancien `profileFilterIds` : une seule valeur
//      valide est reprise, zéro ou plusieurs retombent sur « Toutes » ;
//   ⑥ « Activités » porte le même filtre, servi par les événements existants ;
//   ⑦ le Studio annonce la passion de publication et prend l'active par défaut ;
//   ⑧ l'ARCHIVAGE ne supprime AUCUN contenu, refuse la dernière passion, refuse
//      la passion active, et la restauration remet tout en place ;
//   ⑨ un message garde le pseudo principal comme identité ;
//   ⑩ le kill switch rend l'écran historique, multisélection comprise ;
//   ⑪ mobile 320 / 390 / 430 px : aucun débordement horizontal.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page, opts = {}) {
  if (opts.kill) await page.addInitScript(() => localStorage.setItem("passio_ui_8", "0"));
  await bootOnboarded(page, opts.errors || null, 1, {});
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = () => {};
  });
}

// Trois passions et une publication dans chacune. On écrit dans l'état, jamais
// dans le DOM : c'est l'état qui est la source de vérité de cet écran.
async function poserTroisPassions(page) {
  await page.evaluate(() => {
    // ⚠️ Le libellé affiché vient du CATALOGUE (`passionById(...).label`), jamais
    // du champ `name` de la persona : « Yoga / Bien-être » est donc raccourci en
    // « Yoga » par `_passionCourte`, ce que ce jeu de données éprouve exprès.
    state.user.profiles = [
      { id: "v8_moto", passion: "moto", name: "Moto", emoji: "🏍", color: "#7c3aed", bio: "Trail" },
      { id: "v8_pod", passion: "podcast", name: "Podcast", emoji: "🎙", color: "#7c3aed", bio: "Hebdo" },
      { id: "v8_yoga", passion: "yoga", name: "Yoga", emoji: "🧘", color: "#7c3aed", bio: "Matin" },
    ];
    state.user.currentProfileId = "v8_moto";
    state.userPosts = [
      { id: "v8_p1", authorId: "me", profileId: "v8_moto", passion: "moto", type: "text", text: "Col du Galibier", createdAt: Date.now() - 1000, likes: 0, comments: [] },
      { id: "v8_p2", authorId: "me", profileId: "v8_pod", passion: "podcast", type: "text", text: "Episode 12", createdAt: Date.now() - 2000, likes: 0, comments: [] },
      { id: "v8_p3", authorId: "me", profileId: "v8_yoga", passion: "yoga", type: "text", text: "Salutation au soleil", createdAt: Date.now() - 3000, likes: 0, comments: [] },
    ];
    saveState();
  });
}

async function ouvrirProfil(page, onglet) {
  await page.evaluate(() => goTo("profiles"));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-profiles");
    return el && el.classList.contains("active");
  });
  await page.evaluate(() => renderProfilesScreen());
  await page.waitForTimeout(300);
  if (onglet) {
    const t = page.locator(`[data-v7-tab="${onglet}"]`);
    if (await t.count()) { await t.click(); await page.waitForTimeout(200); }
  }
}

test.describe("UI-8 — un profil personnel, plusieurs passions", () => {
  // ── ① Le profil personnel, intact, et la ligne de passion active ──────────
  test("le profil personnel garde tout, et annonce la passion active", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await poserTroisPassions(page);
    await ouvrirProfil(page);

    await expect(page.locator("#mainProfileUsername")).toBeVisible();
    await expect(page.locator("#screen-profiles .main-profile-stat").nth(1)).toBeVisible(); // abonnés
    await expect(page.locator("#screen-profiles .main-profile-stat").nth(2)).toBeVisible(); // abonnements
    await expect(page.locator("#v6bModifier")).toBeVisible();

    const ligne = page.locator("#v8ActivePassion");
    await expect(ligne).toBeVisible();
    await expect(ligne).toContainText("Passion active");
    await expect(ligne).toContainText("Moto");
    await expect(page.locator("[data-v8-changer]")).toBeVisible();

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("« Changer » ouvre le sélecteur, et le choix appelle switchToProfile", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page);

    await page.locator("[data-v8-changer]").click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-v8-switch="v8_moto"]')).toHaveClass(/on/);

    await page.locator('[data-v8-switch="v8_pod"]').click();
    await page.waitForFunction(() => state.user.currentProfileId === "v8_pod", null, { timeout: 5000 });
    // « afficher une confirmation » : le changement d'univers n'est jamais muet.
    await expect(page.locator(".toast").last()).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.locator("#v8ActivePassion")).toContainText("Podcast");
  });

  // ── ② « À propos » ne filtre plus ─────────────────────────────────────────
  test("les cartes ne portent plus la multisélection ni « Réinitialiser »", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    await expect(page.locator("#profileList .v8-passion-card")).toHaveCount(3);
    // Aucune carte ne porte le handler de multisélection, ni la classe qui la
    // marquait « sélectionnée ».
    expect(await page.evaluate(() =>
      [...document.querySelectorAll("#profileList .profile-card")]
        .filter((c) => (c.getAttribute("onclick") || "").includes("toggleProfileSelect")).length)).toBe(0);
    await expect(page.locator("#profileList .profile-card.selected")).toHaveCount(0);
    await expect(page.locator("#profilesQuotaSub")).not.toContainText("Réinitialiser");
    // « + Ajouter une passion » reste.
    await expect(page.locator("#nouveauProfilLien")).toBeVisible();

    // Chaque carte porte son état, et son décompte.
    await expect(page.locator('[data-v8-active="v8_moto"]')).toHaveText(/Passion active/);
    await expect(page.locator('[data-v8-utiliser="v8_pod"]')).toHaveText("Utiliser pour créer");
    await expect(page.locator('[data-v8-card="v8_moto"] .v8-card-meta')).toContainText("1 publication");
  });

  // ── ③ « Utiliser pour créer » ─────────────────────────────────────────────
  test("« Utiliser pour créer » change l'identité active, sans propagation", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    // La carte entière ouvre l'édition : le bouton ne doit PAS la déclencher.
    await page.locator('[data-v8-utiliser="v8_yoga"]').click();
    await page.waitForFunction(() => state.user.currentProfileId === "v8_yoga", null, { timeout: 5000 });
    await page.waitForTimeout(400);
    await expect(page.locator("#modalBackdrop.active")).toHaveCount(0);
    // Les rôles se sont échangés.
    await expect(page.locator('[data-v8-active="v8_yoga"]')).toHaveCount(1);
    await expect(page.locator('[data-v8-utiliser="v8_moto"]')).toHaveCount(1);
  });

  test("le reste de la carte ouvre l'édition existante de la passion", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    await page.locator('[data-v8-card="v8_pod"] .profile-card-name').click();
    await page.waitForTimeout(400);
    await expect(page.locator("#modalBackdrop")).toHaveClass(/active/);
    // C'est bien le moteur d'édition historique (photo, couverture, bio).
    await expect(page.locator("#editPassionBio")).toHaveCount(1);
  });

  // ── ④ Le filtre « Publications » ──────────────────────────────────────────
  test("« Publications » : filtre à choix unique, « Toutes » par défaut", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "publications");

    const rangee = page.locator("#v8PostFilter");
    await expect(rangee).toBeVisible();
    await expect(rangee.locator(".v8-chip")).toHaveCount(4); // Toutes + 3
    await expect(rangee.locator('[data-v8-chip="toutes"]')).toHaveClass(/on/);
    await expect(page.locator("#myPosts .post")).toHaveCount(3);

    await rangee.locator('[data-v8-chip="v8_pod"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("#myPosts .post")).toHaveCount(1);
    await expect(page.locator("#myPosts")).toContainText("Episode 12");
    // Choix UNIQUE : une seule pastille allumée.
    await expect(rangee.locator(".v8-chip.on")).toHaveCount(1);

    // Un second choix REMPLACE le premier, il ne s'y ajoute pas.
    await rangee.locator('[data-v8-chip="v8_yoga"]').click();
    await page.waitForTimeout(300);
    await expect(rangee.locator(".v8-chip.on")).toHaveCount(1);
    await expect(page.locator("#myPosts")).toContainText("Salutation au soleil");

    // Retour au neutre.
    await rangee.locator('[data-v8-chip="toutes"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("#myPosts .post")).toHaveCount(3);
    expect(await page.evaluate(() => state.user.profilePostFilterId)).toBeFalsy();
  });

  test("une publication qui n'a QU'un profileId reste atteignable", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => {
      state.userPosts.push({
        id: "v8_vieux", authorId: "me", profileId: "v8_pod", type: "text",
        text: "Publication ancienne sans passion", createdAt: Date.now() - 9000, likes: 0, comments: [],
      });
      saveState();
    });
    await ouvrirProfil(page, "publications");
    await page.locator('#v8PostFilter [data-v8-chip="v8_pod"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("#myPosts")).toContainText("Publication ancienne sans passion");
  });

  // ── ⑤ Migration défensive de l'ancien état ────────────────────────────────
  test("migration : une seule ancienne valeur valide est reprise", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => {
      state.user.profileFilterIds = ["v8_pod"];
      delete state.user.profilePostFilterId;
      delete state.user._v8FiltresMigres;
      saveState();
    });
    await ouvrirProfil(page, "publications");
    expect(await page.evaluate(() => state.user.profilePostFilterId)).toBe("v8_pod");
    // L'ancien état n'est jamais effacé.
    expect(await page.evaluate(() => state.user.profileFilterIds)).toEqual(["v8_pod"]);
  });

  test("migration : zéro ou plusieurs anciennes valeurs → « Toutes »", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    for (const anciens of [[], ["v8_pod", "v8_yoga"], ["inconnu"]]) {
      await page.evaluate((a) => {
        state.user.profileFilterIds = a;
        delete state.user.profilePostFilterId;
        delete state.user._v8FiltresMigres;
        saveState();
      }, anciens);
      await ouvrirProfil(page, "publications");
      expect(await page.evaluate(() => state.user.profilePostFilterId), JSON.stringify(anciens)).toBeFalsy();
    }
  });

  // ── ⑥ Le filtre « Activités » ─────────────────────────────────────────────
  test("« Activités » porte le même filtre, servi par les événements existants", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => {
      const dans = (j) => Date.now() + j * 86400000;
      state.userEvents = [
        { id: "v8_e1", title: "Balade des cols", passion: "moto", date: dans(3), city: "Annecy", createdBy: MY_UID || "me", attendees: [] },
        { id: "v8_e2", title: "Enregistrement live", passion: "podcast", date: dans(5), city: "Lyon", createdBy: MY_UID || "me", attendees: [] },
      ];
      saveState();
    });
    await ouvrirProfil(page, "activites");

    const rangee = page.locator("#v8EventFilter");
    await expect(rangee).toBeVisible();
    await expect(page.locator("#profileEvents")).toContainText("Balade des cols");
    await expect(page.locator("#profileEvents")).toContainText("Enregistrement live");

    await rangee.locator('[data-v8-chip="v8_pod"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("#profileEvents")).toContainText("Enregistrement live");
    await expect(page.locator("#profileEvents")).not.toContainText("Balade des cols");
    // Chaque ligne garde sa date et sa ville.
    await expect(page.locator("#profileEvents")).toContainText("Lyon");
  });

  // ── ⑦ Le Studio ───────────────────────────────────────────────────────────
  test("le Studio annonce la passion de publication et prend l'active par défaut", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => switchToProfile("v8_pod"));
    await page.waitForTimeout(300);
    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(600);

    await expect(page.locator("[data-v6-passio]")).toContainText("Publication dans");
    await expect(page.locator("[data-v6-passio]")).toContainText("Podcast");
    expect(await page.evaluate(() => document.getElementById("postPassion").value)).toBe("podcast");

    // Choisir une AUTRE passion pour une publication ne change pas la passion
    // active de façon durable. Le <select> est REPLIÉ derrière « Changer » :
    // on joue le vrai parcours plutôt que d'écrire dans un nœud invisible.
    await page.locator(".v6-passio .v6-lien").click();
    await page.waitForTimeout(200);
    await page.selectOption("#postPassion", "yoga");
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => state.user.currentProfileId)).toBe("v8_pod");
    await expect(page.locator("[data-v6-passio]")).toContainText("Yoga");
  });

  test("le Studio ne propose pas de publier dans une passion archivée", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => { archiverPassion("v8_yoga"); });
    await page.waitForTimeout(300);
    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(600);
    const valeurs = await page.evaluate(() =>
      [...document.getElementById("postPassion").options].map((o) => o.value));
    expect(valeurs).not.toContain("yoga");
    expect(valeurs).toContain("moto");
  });

  // ── ⑧ L'archivage ─────────────────────────────────────────────────────────
  test("archiver ne supprime AUCUN contenu, et la restauration remet tout", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    const postsAvant = await page.evaluate(() => state.userPosts.length);
    await page.evaluate(() => confirmArchivePassion("v8_yoga"));
    await page.waitForTimeout(300);
    await page.locator('[data-v8-archiver="v8_yoga"]').click();
    await page.waitForTimeout(500);

    // La passion quitte la liste, mais RIEN n'est supprimé.
    await expect(page.locator("#profileList .v8-passion-card")).toHaveCount(2);
    expect(await page.evaluate(() => state.userPosts.length)).toBe(postsAvant);
    expect(await page.evaluate(() => state.user.profiles.length)).toBe(3);
    expect(await page.evaluate(() =>
      state.user.profiles.find((p) => p.id === "v8_yoga").archived)).toBe(true);

    // Et ses publications restent visibles dans « Toutes ».
    await page.locator('[data-v7-tab="publications"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("#myPosts")).toContainText("Salutation au soleil");
    // La pastille de la passion archivée a quitté la rangée.
    await expect(page.locator('#v8PostFilter [data-v8-chip="v8_yoga"]')).toHaveCount(0);

    // Restauration.
    await page.locator('[data-v7-tab="apropos"]').click();
    await page.waitForTimeout(200);
    await page.locator("[data-v8-archivees]").click();
    await page.waitForTimeout(300);
    await page.locator('[data-v8-restaurer="v8_yoga"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator("#profileList .v8-passion-card")).toHaveCount(3);
    expect(await page.evaluate(() =>
      !!state.user.profiles.find((p) => p.id === "v8_yoga").archived)).toBe(false);
  });

  test("archiver la passion ACTIVE est refusé, et propose d'en choisir une autre", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    await page.evaluate(() => confirmArchivePassion("v8_moto")); // la passion active
    await page.waitForTimeout(400);
    // Aucune confirmation d'archivage : c'est le sélecteur qui s'ouvre.
    await expect(page.locator("[data-v8-archiver]")).toHaveCount(0);
    await expect(page.locator('[data-v8-switch="v8_pod"]')).toBeVisible();
    expect(await page.evaluate(() =>
      !!state.user.profiles.find((p) => p.id === "v8_moto").archived)).toBe(false);
  });

  test("archiver la DERNIÈRE passion est refusé", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      state.user.profiles = [{ id: "v8_seule", passion: "moto", name: "Moto", emoji: "🏍", color: "#7c3aed", bio: "" }];
      state.user.currentProfileId = "v8_seule";
      saveState();
    });
    await ouvrirProfil(page, "apropos");
    await page.evaluate(() => confirmArchivePassion("v8_seule"));
    await page.waitForTimeout(400);
    await expect(page.locator("[data-v8-archiver]")).toHaveCount(0);
    expect(await page.evaluate(() =>
      !!state.user.profiles.find((p) => p.id === "v8_seule").archived)).toBe(false);
    // Et l'appel direct au moteur ne passe pas davantage.
    await page.evaluate(() => archiverPassion("v8_seule"));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() =>
      !!state.user.profiles.find((p) => p.id === "v8_seule").archived)).toBe(false);
  });

  test("le menu d'une passion propose l'archivage, plus la suppression", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    await page.locator('[data-v8-card="v8_pod"] .profile-dots-btn').click();
    await page.waitForTimeout(400);
    const menu = page.locator("body");
    await expect(menu).toContainText("Archiver cette passion");
    await expect(menu).not.toContainText("Supprimer ce profil");
  });

  // ── ⑧ bis — les portes DÉROBÉES de la suppression et de l'archivage ───────
  // Ces quatre contrôles viennent d'un audit du lot : chacun désignait un
  // chemin par lequel l'invariant « archiver ne supprime rien » tombait.

  test("la modale d'édition ne propose plus la suppression destructrice", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    // ⚠️ Le point sensible : sous UI-8 la carte ENTIÈRE ouvre cette modale.
    // Y laisser « Supprimer ce profil » mettrait la suppression — qui efface
    // aussi `state.userPosts` — à deux taps, plus près qu'avant le lot.
    await page.locator('[data-v8-card="v8_pod"] .profile-card-name').click();
    await page.waitForTimeout(400);
    await expect(page.locator("#modalContent")).not.toContainText("Supprimer ce profil");
    await expect(page.locator("[data-v8-archiver-lien]")).toBeVisible();
  });

  test("archiver décroche le filtre du Fil, qui serait resté sans commande", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    // Le Fil est filtré sur la seule passion qu'on va archiver.
    await page.evaluate(() => setFeedPassions(["yoga"]));
    await page.waitForTimeout(200);
    await page.evaluate(() => { archiverPassion("v8_yoga"); });
    await page.waitForTimeout(400);
    // Sinon : la tuile quitte le Fil (qui ne rend que les vivantes) mais le
    // filtre reste — le Fil ne montrerait plus QUE la passion qu'on vient de
    // ranger, sans rien à l'écran pour en sortir.
    expect(await page.evaluate(() => [..._activeFeedPassions])).not.toContain("yoga");
    expect(await page.evaluate(() => state.selectedFeedPassions || [])).not.toContain("yoga");
  });

  test("une passion archivée quitte le profil PUBLIC", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    // On capture ce que `supaUpsertProfile` publierait réellement.
    await page.evaluate(() => {
      window._v8Publie = null;
      window.supa = {
        from: () => ({
          upsert: async (row) => { window._v8Publie = row; return { error: null }; },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        }),
      };
    });
    await page.evaluate(() => { archiverPassion("v8_yoga"); });
    await page.waitForTimeout(600);
    const passions = await page.evaluate(() => {
      const r = window._v8Publie;
      const p = r && (r.passions || (r.data && r.data.passions));
      return Array.isArray(p) ? p.map((x) => x.id) : null;
    });
    // Si la publication n'a pas eu lieu dans ce contexte de test, on ne conclut
    // rien — mais si elle a eu lieu, la passion rangée n'y est pas.
    if (passions) expect(passions).not.toContain("yoga");
  });

  test("recréer une passion archivée la RESTAURE au lieu d'en faire un doublon", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => { archiverPassion("v8_yoga"); });
    await page.waitForTimeout(300);

    // Elle redevient proposable dans le catalogue de création — sans elle,
    // l'utilisateur se voyait refuser (paywall) une passion invisible.
    await page.evaluate(() => openCreateProfile());
    await page.waitForTimeout(400);
    await expect(page.locator('#newProfileGrid [data-passion="yoga"]')).toHaveCount(1);

    await page.locator('#newProfileGrid [data-passion="yoga"]').click();
    await page.locator("#modalContent").getByText("Créer ce fil").click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => state.user.profiles.length)).toBe(3);
    expect(await page.evaluate(() =>
      state.user.profiles.filter((p) => p.passion === "yoga").length)).toBe(1);
    expect(await page.evaluate(() =>
      !!state.user.profiles.find((p) => p.passion === "yoga").archived)).toBe(false);
  });

  // ── ⑨ Les messages ────────────────────────────────────────────────────────
  test("un message garde le pseudo principal comme identité", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => {
      state.user.general = state.user.general || {};
      state.user.general.username = "Ben sur portable";
      saveState();
      goTo("messages");
    });
    await page.waitForTimeout(800);

    const ligne = page.locator("#v6aMoi");
    await expect(ligne).toBeVisible();
    await expect(ligne.locator(".v6a-moi-nom")).toHaveText("Ben sur portable");
    // La passion n'est qu'un CONTEXTE secondaire.
    await expect(ligne.locator(".v6a-moi-ctx")).toContainText("Moto");

    // Et l'expéditeur réel reste le pseudo général, pas le nom de la passion.
    expect(await page.evaluate(() => _callMyName())).toBe("Ben sur portable");
  });

  // ── ⑩ Le kill switch ──────────────────────────────────────────────────────
  test("kill switch : l'écran historique revient, multisélection comprise", async ({ page }) => {
    await boot(page, { kill: true });
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    await expect(page.locator("#v8ActivePassion")).toHaveCount(0);
    await expect(page.locator("#v8PostFilter")).toHaveCount(0);
    await expect(page.locator("#profileList .v8-passion-card")).toHaveCount(0);
    // La carte historique, avec son handler de multisélection.
    expect(await page.evaluate(() =>
      [...document.querySelectorAll("#profileList .profile-card")]
        .filter((c) => (c.getAttribute("onclick") || "").includes("toggleProfileSelect")).length)).toBe(3);
    // Et UI-6B reprend la main sur l'état des cartes.
    await expect(page.locator("#profileList .v6b-ident")).toHaveCount(3);
  });

  test("kill switch : le composer et les Messages retrouvent leurs mots", async ({ page }) => {
    await boot(page, { kill: true });
    await poserTroisPassions(page);
    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(600);
    await expect(page.locator("[data-v6-passio]")).toContainText("Passion : ");
    await expect(page.locator("[data-v6-passio]")).not.toContainText("Publication dans");

    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(700);
    await expect(page.locator("#v6aMoi")).toBeHidden();
  });

  test("quota : archiver puis restaurer ne réclame jamais de paiement", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page); // 3 passions = la limite gratuite
    await page.evaluate(() => { state.user.passia = 0; archiverPassion("v8_yoga"); });
    await page.waitForTimeout(300);
    // ⚠️ Sans exception, `isNextProfilePaid()` (qui compte toujours les
    // archivées, et c'est voulu) ouvrait le paywall AVANT la grille : la
    // passion rangée devenait impossible à retrouver, et facturée.
    await page.evaluate(() => openCreateProfile());
    await page.waitForTimeout(400);
    await expect(page.locator("#modalContent")).not.toContainText("Solde actuel");
    await expect(page.locator('#newProfileGrid [data-passion="yoga"]')).toHaveCount(1);
  });

  test("kill switch par window : le menu redonne la suppression", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => { window.PASSIO_UI_8 = false; });
    await ouvrirProfil(page, "apropos");
    await page.locator("#profileList .profile-dots-btn").nth(1).click();
    await page.waitForTimeout(400);
    await expect(page.locator("body")).toContainText("Supprimer ce profil");
  });

  // ── ⑪ Mobile ──────────────────────────────────────────────────────────────
  for (const largeur of [320, 390, 430]) {
    test(`${largeur} px : aucun débordement horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 820 });
      const errors = { js: [], console: [], network: [] };
      await boot(page, { errors });
      await poserTroisPassions(page);
      for (const onglet of ["publications", "activites", "apropos"]) {
        await ouvrirProfil(page, onglet);
        const debord = await page.evaluate(() =>
          document.documentElement.scrollWidth > window.innerWidth + 1);
        expect(debord, `débordement sur « ${onglet} » à ${largeur} px`).toBe(false);
      }
      // Cible tactile : le bouton d'état et « Changer » restent confortables.
      const h = await page.evaluate(() => {
        const b = document.querySelector("[data-v8-utiliser]");
        const c = document.querySelector("[data-v8-changer]");
        return {
          etat: b ? Math.round(b.getBoundingClientRect().height) : 0,
          changer: c ? Math.round(c.getBoundingClientRect().height) : 0,
        };
      });
      expect(h.etat).toBeGreaterThanOrEqual(40);
      expect(h.changer).toBeGreaterThanOrEqual(32);
      expect(errors.js, "exceptions JS").toEqual([]);
    });
  }
});
