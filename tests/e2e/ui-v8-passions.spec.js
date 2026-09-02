// Lot UI-8 — « une personne, plusieurs passions ».
//
// Ce que cette suite prouve, et rien d'autre :
// ⚠️ SUITE RÉALIGNÉE PAR LA REFONTE MULTI-PASSION (ADR-011), pas assouplie.
// Quatre surfaces qu'elle verrouillait ont été RETIRÉES : la ligne « Passion
// active », le sélecteur qu'ouvrait « Changer », le bouton « Publier dans
// celle-ci » des cartes, et les deux rangées de puces jumelles. Le modèle, lui,
// ne change pas — un profil personnel, des passions qui classent — et tout ce
// qui le prouve reste ici. Les cas correspondants sont réécrits sur les
// nouvelles surfaces (`#v9ProfilePassions`, `setProfilePassion`) ou déplacés
// dans `refonte-multi-passion.spec.js`, jamais supprimés en silence.
//
//   ① le PROFIL PERSONNEL reste entier (pseudo, bio, abonnés, abonnements,
//      « Modifier ») ;
//   ② les cartes de passion ne filtrent plus : toucher une carte n'appelle plus
//      `toggleProfileSelect`, aucune carte n'est « sélectionnée », et
//      « Réinitialiser » a disparu ;
//   ③ le Studio est le seul point de choix de la passion d'écriture ;
//   ④ « Publications » porte un filtre MULTISÉLECTION (choix unique + « Toutes »
//      neutre, et il filtre pour de vrai ;
//   ⑤ la migration défensive de l'ancien `profileFilterIds` : une seule valeur
//      jusqu'au 2026-08-31), rien de coché valant « toutes » ;
//   ⑥ « Activités » porte le même filtre, servi par les événements existants ;
//   ⑦ le Studio annonce la passion de publication et prend l'active par défaut ;
//   ⑧ l'ARCHIVAGE ne supprime AUCUN contenu, refuse la dernière passion, refuse
//      la passion active, et la restauration remet tout en place ;
//   ⑨ un message garde le pseudo principal comme identité ;
//   ⑩ le kill switch rend l'écran historique, multisélection comprise ;
//   ⑪ mobile 320 / 390 / 430 px : aucun débordement horizontal.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { installerFauxProfiles } = require("./faux-profiles");

async function boot(page, opts = {}) {
  if (opts.kill) await page.addInitScript(() => localStorage.setItem("passio_ui_8", "0"));
  // ⚠️ CONVENTION DE TEST — la même qu'aux mises en ligne d'UI-3A, UI-4 et UI-8.
  // Le lot `flat_passions_v1` (actif par défaut depuis le 2026-09-01) recouvre
  // la surface qu'observe cette suite. Elle pose donc le kill switch du lot qui
  // la recouvre et GARDE TOUTES SES ASSERTIONS — jamais de suppression : c'est
  // ce qui rendrait visible une extinction accidentelle du comportement
  // historique. Le comportement NEUF est prouvé à part, dans
  // `tests/e2e/passions-plates.spec.js`.
  await page.addInitScript(() => localStorage.setItem("flat_passions_v1", "0"));
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
  if (onglet === "apropos") {
    // ⚠️ « À propos » n'est plus un onglet (ADR-011) : la liste des cartes vit
    // dans `#passionManager`, qu'on ouvre explicitement. L'intention du test —
    // « regarder les cartes de passion » — est inchangée, son chemin non.
    await page.evaluate(() => openPassionManager());
    await page.waitForTimeout(300);
  } else if (onglet) {
    const t = page.locator(`[data-v7-tab="${onglet}"]`);
    if (await t.count()) { await t.click(); await page.waitForTimeout(200); }
  }
}

test.describe("UI-8 — un profil personnel, plusieurs passions", () => {
  // ── ① Le profil personnel, intact, et la ligne de passion active ──────────
  test("le profil personnel garde tout", async ({ page }) => {
    const errors = { js: [], console: [], network: [] };
    await boot(page, { errors });
    await poserTroisPassions(page);
    await ouvrirProfil(page);

    await expect(page.locator("#mainProfileUsername")).toBeVisible();
    await expect(page.locator("#screen-profiles .main-profile-stat").nth(1)).toBeVisible(); // abonnés
    await expect(page.locator("#screen-profiles .main-profile-stat").nth(2)).toBeVisible(); // abonnements
    await expect(page.locator("#v6bModifier")).toBeVisible();

    // ⚠️ La ligne « Passion active : X · Changer » a été RETIRÉE (ADR-011 §2) :
    // §3 de la refonte fait du Studio le seul endroit où l'on choisit la passion
    // de destination. Ce que le profil montre à sa place — le rail de bulles —
    // est verrouillé par `refonte-multi-passion.spec.js`.
    await expect(page.locator("#v8ActivePassion")).toHaveCount(0);
    await expect(page.locator("[data-v8-changer]")).toHaveCount(0);
    await expect(page.locator("#v9ProfilePassions")).toBeVisible();

    expect(errors.js, "exceptions JS").toEqual([]);
  });

  test("le choix de la passion d'écriture vit dans le STUDIO, et il persiste", async ({ page }) => {
    // ⚠️ CE CAS REMPLACE « Changer ouvre le sélecteur ». Le geste change de
    // place — le `<select>` du Studio au lieu d'une modale ouverte depuis le
    // profil (ADR-011 §4) — mais la garantie qui comptait reste : le choix
    // appelle `switchToProfile`, il est CONFIRMÉ, et il persiste.
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const s = document.getElementById("postPassion");
      s.value = "podcast";
      s.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() => state.user.currentProfileId === "v8_pod", null, { timeout: 5000 });
    // « afficher une confirmation » : le changement d'univers n'est jamais muet.
    await expect(page.locator(".toast").last()).toBeVisible();
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

    // Chaque carte porte son décompte, et INDIQUE la passion que le Studio
    // présélectionnera. ⚠️ Elle ne l'OFFRE plus comme un choix : « Publier dans
    // celle-ci » a été retiré (ADR-011 §4), le Studio est le seul point de choix.
    await expect(page.locator('[data-v8-active="v8_moto"]')).toHaveText(/Passion du Studio/);
    await expect(page.locator('[data-v8-utiliser="v8_pod"]')).toHaveCount(0);
    await expect(page.locator('[data-v8-card="v8_moto"] .v8-card-meta')).toContainText("1 publication");
  });

  // ── ③ Le choix d'écriture, depuis le Studio, se reflète sur les cartes ────
  test("changer de passion dans le Studio déplace le marqueur des cartes", async ({ page }) => {
    // ⚠️ RÉÉCRIT SUR LE NOUVEAU CHEMIN. Le bouton « Publier dans celle-ci » a
    // été retiré des cartes ; ce que ce cas prouvait — que l'identité d'écriture
    // change réellement et que l'affichage suit — reste vérifié.
    await boot(page);
    await poserTroisPassions(page);
    await page.evaluate(() => goTo("studio"));
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const s = document.getElementById("postPassion");
      s.value = "yoga";
      s.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() => state.user.currentProfileId === "v8_yoga", null, { timeout: 5000 });

    await ouvrirProfil(page, "apropos");
    await expect(page.locator('[data-v8-active="v8_yoga"]')).toHaveCount(1);
    await expect(page.locator('[data-v8-active="v8_moto"]')).toHaveCount(0);
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
  test("« Publications » : filtre MULTI-SÉLECTION, rien de coché = tout", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "publications");

    // ⚠️ DEUX INVERSIONS SUCCESSIVES, ET C'EST LA SECONDE QUI VAUT. Les deux
    // rangées de puces jumelles (`#v8PostFilter` / `#v8EventFilter`) ont d'abord
    // été remplacées par UN rail de bulles à choix UNIQUE avec une bulle
    // « Toutes » (ADR-011 §2) ; sur demande de Benjamin (2026-08-31) ce rail
    // passe en MULTISÉLECTION et « Toutes » disparaît — en multi, ne rien cocher
    // dit déjà « toutes », et garder la bulle offrait deux commandes pour un
    // seul état. Ce que le test garantit ne bouge pas : le rail commande
    // Publications ET Activité, et il filtre pour de vrai.
    const rangee = page.locator("#v9ProfilePassions");
    await expect(rangee).toBeVisible();
    await expect(rangee.locator(".profile-tile")).toHaveCount(3); // 3 passions, plus de « Toutes »
    await expect(rangee.locator('[data-passion-tile=""]')).toHaveCount(0);
    // Neutre au départ : aucune cochée, tout est là.
    await expect(rangee.locator(".profile-tile.active")).toHaveCount(0);
    await expect(page.locator("#myPosts .post")).toHaveCount(3);

    await rangee.locator('[data-passion-tile="v8_pod"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator("#myPosts .post")).toHaveCount(1);
    await expect(page.locator("#myPosts")).toContainText("Episode 12");
    await expect(rangee.locator(".profile-tile.active")).toHaveCount(1);

    // Un second choix S'AJOUTE au premier — c'est toute la différence.
    await rangee.locator('[data-passion-tile="v8_yoga"]').click();
    await page.waitForTimeout(300);
    await expect(rangee.locator(".profile-tile.active")).toHaveCount(2);
    await expect(page.locator("#myPosts .post")).toHaveCount(2);
    await expect(page.locator("#myPosts")).toContainText("Salutation au soleil");
    await expect(page.locator("#myPosts")).toContainText("Episode 12");

    // Retour au neutre en DÉCOCHANT : il n'y a plus d'autre chemin, et il doit
    // ramener exactement l'état de départ.
    await rangee.locator('[data-passion-tile="v8_pod"]').click();
    await rangee.locator('[data-passion-tile="v8_yoga"]').click();
    await page.waitForTimeout(300);
    await expect(rangee.locator(".profile-tile.active")).toHaveCount(0);
    await expect(page.locator("#myPosts .post")).toHaveCount(3);
    expect(await page.evaluate(() => state.user.profilePassionIds)).toEqual([]);
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
    await page.locator('#v9ProfilePassions [data-passion-tile="v8_pod"]').click();
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

    // Le MÊME rail commande les deux onglets : un seul geste, deux effets.
    const rangee = page.locator("#v9ProfilePassions");
    await expect(rangee).toBeVisible();
    await expect(page.locator("#profileEvents")).toContainText("Balade des cols");
    await expect(page.locator("#profileEvents")).toContainText("Enregistrement live");

    await rangee.locator('[data-passion-tile="v8_pod"]').click();
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

    await expect(page.locator("[data-v6-passio]")).toContainText("Publier dans");
    await expect(page.locator("[data-v6-passio]")).toContainText("Podcast");
    expect(await page.evaluate(() => document.getElementById("postPassion").value)).toBe("podcast");

    // ⚠️ INVERSION ASSUMÉE (ADR-011 §3). Ce test exigeait auparavant que choisir
    // une autre passion ici NE change PAS la passion d'écriture de façon
    // durable : la ligne « Passion active » du profil s'en chargeait. Cette
    // ligne est retirée (§1) et le Studio devient le SEUL endroit où la passion
    // de destination se choisit — donc son choix doit persister, sans quoi plus
    // rien ne pourrait la changer. Le <select> est REPLIÉ derrière « Changer » :
    // on joue le vrai parcours plutôt que d'écrire dans un nœud invisible.
    await page.locator(".v6-passio .v6-lien").click();
    await page.waitForTimeout(200);
    await page.selectOption("#postPassion", "yoga");
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => state.user.currentProfileId)).toBe("v8_yoga");
    await expect(page.locator("[data-v6-passio]")).toContainText("Yoga");

    // Et le choix survit au départ de l'écran : c'est ce qui en fait un réglage
    // et non une bascule d'un seul post.
    await page.evaluate(() => { goTo("feed"); goTo("studio"); });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.getElementById("postPassion").value)).toBe("yoga");
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
    await expect(page.locator('#v9ProfilePassions [data-passion-tile="v8_yoga"]')).toHaveCount(0);

    // Restauration.
    await page.evaluate(() => openPassionManager());
    await page.waitForTimeout(300);
    await page.locator("[data-v8-archivees]").click();
    await page.waitForTimeout(300);
    await page.locator('[data-v8-restaurer="v8_yoga"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator("#profileList .v8-passion-card")).toHaveCount(3);
    expect(await page.evaluate(() =>
      !!state.user.profiles.find((p) => p.id === "v8_yoga").archived)).toBe(false);
  });

  test("archiver la passion du Studio est possible : elle bascule d'elle-même", async ({ page }) => {
    // ⚠️ EXIGENCE INVERSÉE, ET C'EST VOULU. L'archivage REFUSAIT la passion
    // active et renvoyait vers un sélecteur (« choisis d'abord une autre
    // passion active »). Ce sélecteur n'existe plus (ADR-011 §2) : exiger un
    // geste devenu impossible aurait fait de ce refus un cul-de-sac. Ce qui
    // compte est préservé — `currentProfileId` ne doit JAMAIS pointer une
    // passion archivée, `currentProfile()` rendant `null` dans ce cas.
    await boot(page);
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    await page.evaluate(() => archiverPassion("v8_moto")); // la passion du Studio
    await page.waitForTimeout(500);
    expect(await page.evaluate(() =>
      !!state.user.profiles.find((p) => p.id === "v8_moto").archived)).toBe(true);
    // Elle a basculé sur une passion VIVANTE, au point d'écriture.
    const courant = await page.evaluate(() => state.user.currentProfileId);
    expect(["v8_pod", "v8_yoga"]).toContain(courant);
    expect(await page.evaluate(() => !!(currentProfile() || {}).archived)).toBe(false);
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

  // ⚠️ RÉÉCRIT le 2026-08-30. Ce test s'appelait « une passion archivée quitte le
  // profil PUBLIC » et ne pouvait PAS rougir : il bouchonnait `window.supa`, qui
  // ne rebinde pas le `supa` de PORTÉE SCRIPT utilisé par `supaUpsertProfile`
  // (app-08:2271), et le helper `boot()` de cette suite neutralise déjà cette
  // fonction. `_v8Publie` restait donc `null`, et la seule assertion était sautée
  // par son propre `if (passions)`. Un verrou qui ne ferme rien.
  //
  // Il disait en outre l'INVERSE du code depuis la correction du même jour : une
  // passion archivée est désormais PUBLIÉE (marquée `archived`), parce que la
  // colonne `profiles.passions` sert aussi de sauvegarde relue par la
  // reconstruction du boot — l'amputer rendait la passion rangée irrécupérable
  // sur un appareil neuf. L'invariant réel est donc : publiée mais marquée, et
  // retirée à l'AFFICHAGE. C'est ce qu'on vérifie ici, sur le vrai chemin.
  test("une passion archivée est publiée MARQUÉE, et retirée à l'affichage", async ({ page }) => {
    await boot(page);
    await poserTroisPassions(page);
    // ⚠️ POINT D'ENTRÉE RÉÉCRIT LE 2026-08-31, assertions conservées. Le faux
    // n'implémentait que `upsert`, l'opération unique qui republiait tout le
    // profil ; elle n'existe plus depuis la séparation des autorités. L'état des
    // passions a désormais son opération propre, `supaSavePassionState`, qui fait
    // un `update` CIBLÉ — le faux ne voyait donc plus rien passer et `_v8Publie`
    // restait `null` : le test redevenait exactement le faux verrou que son
    // commentaire ci-dessus dénonce.
    await page.evaluate(installerFauxProfiles);
    await page.evaluate(() => { archiverPassion("v8_yoga"); });
    await page.waitForTimeout(600);
    const publie = await page.evaluate(() =>
      (window.__updates.filter(u => u.table === "profiles" && u.patch.passions).pop() || {}).patch);
    // La publication DOIT avoir eu lieu : sans cette assertion, le test
    // redeviendrait le faux verrou qu'il était.
    expect(publie, "archiver une passion doit republier la liste").toBeTruthy();
    const ids = publie.passions.map((x) => x.id);
    expect(ids).toContain("yoga");
    expect(publie.passions.find((x) => x.id === "yoga").archived).toBe(true);
    // La passion « principale » ne désigne jamais une passion rangée.
    expect(publie.passion_id).not.toBe("yoga");
    // Et un visiteur ne la voit pas.
    const vues = await page.evaluate((r) => passionsPubliques(r.passions).map((x) => x.id), publie);
    expect(vues).not.toContain("yoga");
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
    // Sélecteur STABLE plutôt que le libellé : ce test vérifie la RESTAURATION
    // d'une passion archivée, pas le texte du bouton. Un renommage de libellé ne
    // doit pas faire rougir un test de comportement.
    await page.locator("#confirmNewPassionBtn").click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => state.user.profiles.length)).toBe(3);
    expect(await page.evaluate(() =>
      state.user.profiles.filter((p) => p.passion === "yoga").length)).toBe(1);
    expect(await page.evaluate(() =>
      !!state.user.profiles.find((p) => p.passion === "yoga").archived)).toBe(false);
  });

  // ── ⑨ Les messages ────────────────────────────────────────────────────────
  // ⚠️ RÉALIGNÉ le 2026-08-31 : la ligne d'identité de l'inbox (« Ben sur
  // portable · 🏍️ Moto ») a été RETIRÉE sur demande de Benjamin. Ce que ce test
  // protégeait vraiment — l'expéditeur réel d'un message est le pseudo GÉNÉRAL,
  // jamais le nom de la passion active — n'a pas bougé et reste vérifié ici,
  // sur le moteur (`_callMyName`) plutôt que sur un affichage disparu.
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

    // La tête existe, et elle n'annonce plus aucune identité.
    await expect(page.locator("#v6aHead")).toHaveCount(1);
    await expect(page.locator("#v6aMoi")).toHaveCount(0);
    expect(await page.locator("#v6aHead").innerText()).not.toContain("Ben sur portable");

    // L'expéditeur réel reste le pseudo général, pas le nom de la passion.
    expect(await page.evaluate(() => _callMyName())).toBe("Ben sur portable");
  });

  // ── ⑩ Le kill switch ──────────────────────────────────────────────────────
  test("kill switch : l'écran historique revient, multisélection comprise", async ({ page }) => {
    await boot(page, { kill: true });
    await poserTroisPassions(page);
    await ouvrirProfil(page, "apropos");

    await expect(page.locator("#v8ActivePassion")).toHaveCount(0);
    await expect(page.locator("#v9ProfilePassions")).toHaveCount(0);
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
    // ⚠️ Doit viser le libellé UI-8 COURANT (« Publier dans » depuis ADR-010).
    // Garder « Publication dans » ferait passer ce test sur une chaîne qui
    // n'existe plus nulle part : un verrou qui ne ferme rien.
    await expect(page.locator("[data-v6-passio]")).not.toContainText("Publier dans");

    // ⚠️ La ligne d'identité n'existe plus dans AUCUN des deux états depuis le
    // 2026-08-31 : le kill switch UI-8 n'a donc plus rien à rendre ici. On
    // vérifie qu'il ne la fait pas non plus RÉAPPARAÎTRE — une coupure qui
    // ressusciterait une surface retirée serait le défaut symétrique.
    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(700);
    await expect(page.locator("#v6aMoi")).toHaveCount(0);
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
      // Cible tactile. ⚠️ Les deux commandes que ce test mesurait — le bouton
      // « Utiliser pour créer » de la carte et le « Changer » de la ligne
      // « Passion active » — n'existent plus : ADR-011 retire la ligne (§1) et
      // fait de la carte une INFORMATION, le choix de la passion d'écriture
      // ayant rejoint le Studio (§3). L'intention du test est conservée sur les
      // deux surfaces qui les remplacent : la bulle du rail de passions (le
      // geste de filtrage, §1) et la carte entière (le geste d'édition).
      const h = await page.evaluate(() => {
        const b = document.querySelector("[data-v8-card]");
        const c = document.querySelector("#v9ProfilePassions [data-passion-tile]");
        return {
          carte: b ? Math.round(b.getBoundingClientRect().height) : 0,
          bulle: c ? Math.round(c.getBoundingClientRect().height) : 0,
        };
      });
      expect(h.carte).toBeGreaterThanOrEqual(40);
      expect(h.bulle).toBeGreaterThanOrEqual(40);
      expect(errors.js, "exceptions JS").toEqual([]);
    });
  }
});
