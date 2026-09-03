// ══════════════════════════════════════════════════════════════════════════
// « MES PASSIONS » — LA PAGE DÉDIÉE  (2026-09-03)
//
// Demande de Benjamin, maquette à l'appui. Deux choses en une :
//
//   ① UNE RÈGLE PRODUIT. Il n'existe AUCUNE passion principale, favorite ou
//      prioritaire. Toutes les passions actives ont exactement la même
//      importance ; la passion d'une publication se choisit AU STUDIO, au
//      moment de publier. La pastille « Passion du Studio ✓ » et le liseré
//      d'élection donnaient le contraire à lire, à chaque ouverture.
//
//   ② UNE FORME. La gestion des passions était une SECTION du profil, prise
//      entre l'état vide « Créer un post » (déplacé là par UI-7) et le Studio.
//      Elle devient une PAGE : en-tête (retour · titre · aide), résumé, quota,
//      cartes identiques, porte d'ajout, archives repliables.
//
// ⚠️ CE QUE CETTE SUITE MESURE, ET COMMENT. Les quatre états croisés du haut de
// page — place disponible / limite atteinte × changement disponible / aucun —
// ont chacun leur cas. Aucun ne lit un nombre écrit en dur : ils lisent
// `PASSIONS_OFFERTES` et `CHANGEMENTS_PASSION_OFFERTS` dans la page, pour qu'un
// changement de plafond n'oblige jamais à réécrire un test au lieu de le faire
// échouer honnêtement.
//
// ⚠️ CE QU'ELLE NE PROUVE PAS : rien ici ne touche Supabase. Le quota, le
// journal des changements et leur persistance ont leur propre suite
// (`passions-archive-quota.spec.js`) ; ici on mesure la PAGE.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const APERCU = "?passio_preview=flat-passions-v1";

// Passions RÉELLES du référentiel plat : une passion inconnue s'affiche
// « ✨ Passion » et un test vert sur ce libellé ne dirait plus rien.
const DISPO = ["voyage", "cuisine", "photo", "podcast", "moto"];

// On POSE la situation, on ne prouve pas le chemin d'ajout (couvert par
// `passions-plates.spec.js`). `vivantes` + `archivees` sont pris dans DISPO,
// dans cet ordre ; `changements` est le nombre de changements DÉJÀ consommés.
async function poser(page, { vivantes = 2, archivees = 0, changements = 0 } = {}) {
  await bootOnboarded(page, null, 1, { query: APERCU });
  await page.evaluate((o) => {
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    window.supaUpsertProfile = async () => {};

    const profils = [];
    for (let i = 0; i < o.vivantes; i++) {
      profils.push({
        id: "mp_" + i, name: "QA", passion: o.dispo[i], emoji: "✨", bio: "",
        color: "#8b5cf6", createdAt: i + 1,
      });
    }
    for (let i = 0; i < o.archivees; i++) {
      profils.push({
        id: "mp_arch_" + i, name: "QA", passion: o.dispo[o.dispo.length - 1 - i], emoji: "✨",
        bio: "", color: "#8b5cf6", createdAt: 90 + i,
        archived: true, archivedAt: Date.now() - (i + 1) * 86400000,
      });
    }
    state.user.profiles = profils;
    state.user.currentProfileId = profils[0].id;
    state.user.passionChanges = {
      entries: Array.from({ length: o.changements }, (_, i) => ({
        type: "archive", passion: o.dispo[i], label: "x", emoji: "✨",
        at: Date.now(), compte: true,
      })),
    };
    state.userPosts = [];
    saveState();
    goTo("profiles");
  }, { vivantes, archivees, changements, dispo: DISPO });
  await page.waitForTimeout(500);
}

async function ouvrir(page) {
  await page.evaluate(() => openPassionManager());
  await page.waitForTimeout(450);
}

// Les deux plafonds, LUS DANS LA PAGE. Un test qui écrit « 3 » passe encore le
// jour où l'offre change, et ment alors sur ce qu'il vérifie.
const plafonds = (page) => page.evaluate(() => ({
  passions: PASSIONS_OFFERTES,
  changements: CHANGEMENTS_PASSION_OFFERTS,
}));

// ══════════════════════════════════════════════════════════════════════════
// ① LA PAGE EST UNE PAGE — plus rien du profil au-dessus ni en dessous
// ══════════════════════════════════════════════════════════════════════════
test("① ouverte, la page remplace le profil : plus de « Créer un post » au-dessus", async ({ page }) => {
  await poser(page, { vivantes: 2 });

  // Avant : le profil est là, et son état vide propose « Créer un post ».
  const avant = await page.evaluate(() => ({
    carte: !!document.getElementById("mainProfileCard").offsetParent,
    creerUnPost: (document.getElementById("screen-profiles").textContent || "").includes("Créer un post"),
  }));
  expect(avant.carte, "le profil s'affiche normalement avant l'ouverture").toBe(true);
  expect(avant.creerUnPost, "l'état vide « Créer un post » est bien là avant").toBe(true);

  await ouvrir(page);

  const pendant = await page.evaluate(() => {
    const ec = document.getElementById("screen-profiles");
    // ⚠️ `offsetParent`, jamais `.hidden` ni la présence dans le DOM : ces
    // nœuds ne sont pas RETIRÉS (les rendus continuent d'écrire dedans), ils
    // sont masqués. C'est la seule mesure qui distingue les deux.
    const peint = (id) => { const n = document.getElementById(id); return !!(n && n.offsetParent); };
    const visibles = [...ec.children].filter((n) => n.offsetParent).map((n) => n.id || n.className);
    return {
      page: peint("passionManager"),
      identite: peint("mainProfileCard"),
      onglets: peint("v7ProfileTabs"),
      mesPosts: peint("myPosts"),
      rail: peint("v9ProfilePassions"),
      studio: (document.getElementById("studioTypeTabs") || {}).offsetParent != null,
      creerUnPost: [...ec.querySelectorAll("*")]
        .some((n) => n.offsetParent && (n.textContent || "").trim() === "Créer un post"),
      visibles,
      // Les nœuds masqués existent TOUJOURS : rien n'a été détruit.
      toujoursLa: !!document.getElementById("mainProfileCard") && !!document.getElementById("myPosts"),
    };
  });
  expect(pendant.page, "la page est à l'écran").toBe(true);
  expect(pendant.identite, "la carte d'identité reste peinte au-dessus de la page").toBe(false);
  expect(pendant.onglets, "les onglets UI-7 restent peints").toBe(false);
  expect(pendant.mesPosts, "le contenu du profil reste peint").toBe(false);
  expect(pendant.rail, "le rail de bulles reste peint").toBe(false);
  expect(pendant.studio, "le Studio reste peint sous la page").toBe(false);
  expect(pendant.creerUnPost, "« Créer un post » est encore affiché au-dessus").toBe(false);
  expect(pendant.visibles, "un seul enfant de l'écran est peint").toEqual(["passionManager"]);
  expect(pendant.toujoursLa, "masquer, jamais retirer : le DOM est intact").toBe(true);

  // Et refermer rend tout, sans rechargement.
  await page.locator("#fermerPassionManager").click();
  await page.waitForTimeout(400);
  const apres = await page.evaluate(() => ({
    page: !!(document.getElementById("passionManager") || {}).offsetParent,
    identite: !!document.getElementById("mainProfileCard").offsetParent,
    mesPosts: !!document.getElementById("myPosts").offsetParent,
  }));
  expect(apres.page, "le retour referme la page").toBe(false);
  expect(apres.identite, "et rend la carte d'identité").toBe(true);
  expect(apres.mesPosts, "et le contenu du profil").toBe(true);
});

// Le geste de retour du téléphone (et de l'iPhone depuis le bord) : LE chemin
// de sortie sur mobile. Sans lui, on quitte le profil depuis une page dont on
// n'est jamais « revenu » — le défaut des quatre grands panneaux, corrigé le
// 2026-09-02, qu'une nouvelle page plein écran rouvre si on l'oublie.
test("① bis — le geste de retour referme la page avant de changer d'écran", async ({ page }) => {
  await poser(page, { vivantes: 2 });
  await ouvrir(page);
  const vu = await page.evaluate(() => {
    const consomme = closeCurrentOverlay();
    return {
      consomme,
      page: !!(document.getElementById("passionManager") || {}).offsetParent,
      ecran: document.getElementById("screen-profiles").classList.contains("active"),
    };
  });
  expect(vu.consomme, "le retour n'a pas été consommé par la page").toBe(true);
  expect(vu.page, "la page est restée ouverte").toBe(false);
  expect(vu.ecran, "et on n'a pas quitté le profil du même geste").toBe(true);
});

// Changer d'écran depuis la barre du bas ne doit pas laisser la page ouverte
// derrière : revenir sur « Profil » rendrait la page au lieu du profil.
test("① ter — naviguer ailleurs referme la page", async ({ page }) => {
  await poser(page, { vivantes: 2 });
  await ouvrir(page);
  const vu = await page.evaluate(() => {
    goTo("feed");
    goTo("profiles");
    return {
      page: !!(document.getElementById("passionManager") || {}).offsetParent,
      identite: !!document.getElementById("mainProfileCard").offsetParent,
    };
  });
  expect(vu.page, "revenir sur Profil rend la page au lieu du profil").toBe(false);
  expect(vu.identite).toBe(true);
});

// ══════════════════════════════════════════════════════════════════════════
// ② AUCUNE PASSION PRINCIPALE — la règle produit, mesurée
// ══════════════════════════════════════════════════════════════════════════
test("② aucune passion n'est principale : les cartes sont identiques", async ({ page }) => {
  await poser(page, { vivantes: 3 });
  await ouvrir(page);

  const vu = await page.evaluate(() => {
    const cartes = [...document.querySelectorAll("#profileList .v8-passion-card")];
    return {
      combien: cartes.length,
      classes: [...new Set(cartes.map((c) => c.className))],
      // La FORME de chaque carte : mêmes blocs, dans le même ordre.
      formes: [...new Set(cartes.map((c) =>
        [...c.children].map((n) => n.className || n.tagName.toLowerCase()).join("|")))],
      // Chacune porte bien ce que la maquette énumère : image, nom, compteurs,
      // menu « … ».
      completes: cartes.every((c) =>
        c.querySelector(".avatar") && c.querySelector(".profile-card-name")
        && c.querySelector(".v8-card-meta") && c.querySelector(".profile-dots-btn")),
      compteurs: cartes.map((c) => c.querySelector(".v8-card-meta").textContent),
      // Et l'identité d'écriture existe TOUJOURS — elle n'est simplement plus
      // exposée ici comme un rang.
      courante: state.user.currentProfileId,
      texte: document.getElementById("passionManager").textContent || "",
    };
  });
  expect(vu.combien).toBe(3);
  expect(vu.classes.length, "une carte se distingue des autres par sa classe").toBe(1);
  expect(vu.formes.length, "une carte porte un bloc que les autres n'ont pas").toBe(1);
  expect(vu.completes, "une carte ne porte pas les quatre éléments attendus").toBe(true);
  for (const c of vu.compteurs) expect(c).toMatch(/publication.*·.*activité/);
  expect(vu.courante, "l'identité d'écriture a disparu du moteur").toBeTruthy();

  // ⚠️ LES MOTS AUSSI. Une pastille retirée mais un libellé resté ailleurs
  // (menu, aide, titre) redirait exactement ce que la règle interdit.
  expect(vu.texte).not.toMatch(/passion principale|principale|favorite|prioritaire/i);
  expect(vu.texte).not.toContain("Passion du Studio");
  expect(vu.texte).not.toMatch(/définir comme/i);
});

test("② bis — le menu « … » d'une carte ne propose aucune passion principale", async ({ page }) => {
  await poser(page, { vivantes: 3 });
  await ouvrir(page);
  await page.locator('[data-v8-card="mp_1"] .profile-dots-btn').click();
  await page.waitForTimeout(350);
  const menu = page.locator("#profileDotsMenu");
  await expect(menu).toBeVisible();
  const texte = (await menu.textContent()) || "";
  expect(texte).not.toMatch(/principale|prioritaire|favorite|Passion du Studio/i);
  // Les actions historiques du menu sont PRÉSERVÉES.
  expect(texte).toContain("Modifier cette passion");
  expect(texte).toContain("Archiver cette passion");
});

// ══════════════════════════════════════════════════════════════════════════
// ③ « X PASSIONS ACTIVES SUR N » — dynamique, jamais écrit en dur
// ══════════════════════════════════════════════════════════════════════════
test("③ le résumé compte les passions actives, et il suit", async ({ page }) => {
  await poser(page, { vivantes: 2 });
  await ouvrir(page);
  const { passions } = await plafonds(page);

  const resume = page.locator("#passionsResume [data-passion-resume]");
  await expect(resume).toHaveText("2 passions actives sur " + passions);

  // Une passion de plus : le résumé suit, sans rechargement.
  await page.evaluate(() => { ajouterPassionAuCompte("moto", ""); renderProfilesScreen(); });
  await page.waitForTimeout(400);
  await expect(resume).toHaveText("3 passions actives sur " + passions);

  // Une passion archivée n'est plus active — et le résumé le dit.
  await page.evaluate(() => { archiverPassion("mp_1"); });
  await page.waitForTimeout(400);
  await expect(resume).toHaveText("2 passions actives sur " + passions);

  // Le singulier existe : « 1 passion active », pas « 1 passions actives ».
  await page.evaluate(() => { archiverPassion("mp_0"); });
  await page.waitForTimeout(400);
  await expect(resume).toHaveText("1 passion active sur " + passions);
});

// ══════════════════════════════════════════════════════════════════════════
// ④→⑦ LES QUATRE ÉTATS DU HAUT DE PAGE
// ══════════════════════════════════════════════════════════════════════════
test("④ place disponible : la porte d'ajout invite et elle est armée", async ({ page }) => {
  await poser(page, { vivantes: 2, changements: 0 });
  await ouvrir(page);
  const porte = page.locator("#nouveauProfilLien");
  await expect(porte).toHaveAttribute("data-passion-porte", "ouverte");
  await expect(porte).toHaveAttribute("role", "button");
  await expect(page.locator("#nouveauProfilTitre")).toHaveText("Ajouter une passion");
  await expect(page.locator("#nouveauProfilSous")).not.toContainText("Limite");
  // Et elle ouvre réellement un chemin d'ajout : jamais un tap mort.
  await porte.click();
  await page.waitForTimeout(700);
  const ouvert = await page.evaluate(() => ({
    recherche: document.querySelectorAll(".psel-input").length,
    grille: document.querySelectorAll("#newProfileGrid").length,
  }));
  expect(ouvert.recherche + ouvert.grille, "la porte n'a rien ouvert").toBeGreaterThan(0);
});

test("⑤ limite atteinte : « Limite de N atteinte », et la porte est désarmée", async ({ page }) => {
  await poser(page, { vivantes: 3, changements: 0 });
  await ouvrir(page);
  const { passions } = await plafonds(page);

  await expect(page.locator("#nouveauProfilTitre")).toHaveText("Ajouter une passion");
  await expect(page.locator("#nouveauProfilSous")).toHaveText("Limite de " + passions + " atteinte");

  const etat = await page.evaluate(() => {
    const b = document.getElementById("nouveauProfilLien");
    return {
      marque: b.getAttribute("data-passion-porte"),
      desactivee: b.getAttribute("aria-disabled"),
      role: b.getAttribute("role"),
      tabindex: b.getAttribute("tabindex"),
      pointeur: getComputedStyle(b).pointerEvents,
      // ⚠️ ELLE RESTE PEINTE : désarmer n'est pas cacher. Une porte qu'on ne
      // voit plus ne dit pas pourquoi elle a disparu.
      peinte: b.getBoundingClientRect().height > 0,
    };
  });
  expect(etat.marque).toBe("fermee");
  expect(etat.desactivee).toBe("true");
  expect(etat.role, "sans `role`, l'activation clavier déléguée d'app-08 n'a plus de prise").toBeNull();
  expect(etat.tabindex, "et le focus ne s'y arrête plus").toBeNull();
  expect(etat.pointeur, "le pointeur atteint encore une porte qui refuse").toBe("none");
  expect(etat.peinte).toBe(true);
});

test("⑥ changement disponible : une information, PAS une alerte", async ({ page }) => {
  await poser(page, { vivantes: 3, changements: 1 });
  await ouvrir(page);
  const { changements } = await plafonds(page);

  const quota = page.locator("#profilesQuotaSub");
  await expect(quota).toBeVisible();
  await expect(quota).toHaveAttribute("data-passion-quota", "disponible");
  await expect(quota).toContainText((changements - 1) + " changement");
  await expect(quota).toContainText("disponible");
  // ⚠️ L'ALERTE NE PARAÎT QUE SI LE QUOTA EST RÉELLEMENT ÉPUISÉ. Une alerte
  // permanente n'alerte plus de rien — c'est tout le point de la demande.
  await expect(page.locator("#profilesQuotaSub.est-alerte")).toHaveCount(0);
  await expect(quota).not.toContainText("Aucun changement disponible");
});

test("⑦ aucun changement disponible : l'alerte, et elle seule", async ({ page }) => {
  await poser(page, { vivantes: 3, changements: 3 });
  await ouvrir(page);

  const quota = page.locator("#profilesQuotaSub");
  await expect(quota).toBeVisible();
  await expect(quota).toHaveAttribute("data-passion-quota", "epuise");
  await expect(quota).toHaveClass(/est-alerte/);
  await expect(quota).toContainText("Aucun changement disponible pour le moment.");
  // Elle s'annonce aux lecteurs d'écran sans les couper : c'est une contrainte
  // de l'écran, pas un incident.
  await expect(quota).toHaveAttribute("role", "status");
});

// ⚠️ L'ÉTAT QU'ON OUBLIE : le visiteur et la démo. `changementsPassionRestants()`
// rend alors `Infinity`, et annoncer une limite qui ne borne rien serait un
// mensonge. Sans ce cas, un rendu qui écrirait « Infinity changements » ou une
// alerte permanente resterait vert.
test("⑦ bis — quota sans objet : ni ligne, ni alerte", async ({ page }) => {
  await poser(page, { vivantes: 2 });
  await page.evaluate(() => {
    window.quotaChangementsActif = () => false;
    renderProfilesScreen();
  });
  await ouvrir(page);
  const quota = page.locator("#profilesQuotaSub");
  await expect(quota).toBeHidden();
  expect(await page.evaluate(() =>
    document.getElementById("profilesQuotaSub").hasAttribute("data-passion-quota"))).toBe(false);
  // Le résumé, lui, reste : il ne dépend pas du quota.
  await expect(page.locator("#passionsResume")).toBeVisible();
});

// ══════════════════════════════════════════════════════════════════════════
// ⑧ LES CARTES RESTENT CLIQUABLES
// ══════════════════════════════════════════════════════════════════════════
test("⑧ une carte ouvre l'espace de sa passion", async ({ page }) => {
  await poser(page, { vivantes: 3 });
  await ouvrir(page);
  await page.locator('[data-v8-card="mp_2"] .profile-card-name').click();
  await page.waitForTimeout(400);
  await expect(page.locator("#modalBackdrop")).toHaveClass(/active/);
  // C'est le moteur d'édition historique (photo, couverture, bio) : rien n'a
  // été réécrit, la page réutilise ce qui existe.
  await expect(page.locator("#editPassionBio")).toHaveCount(1);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑨ LES ARCHIVES — repliables, comptées, sans discours
// ══════════════════════════════════════════════════════════════════════════
test("⑨ « Passions archivées (X) » est repliable et compte juste", async ({ page }) => {
  await poser(page, { vivantes: 2, archivees: 2 });
  await ouvrir(page);

  const tete = page.locator("#passionArchiveToggle");
  await expect(tete).toContainText("Passions archivées (2)");
  await expect(tete).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#passionArchiveList")).toBeVisible();

  // ⚠️ PLUS DE DISCOURS RASSURANT DANS LA LISTE. « Leur contenu est conservé »
  // (et sa version longue « rien n'a été supprimé : publications, activités… »)
  // a rejoint l'aide du « ? », où on la lit une fois au lieu de la relire à
  // chaque ouverture.
  const texte = (await page.locator("#passionArchiveBox").textContent()) || "";
  expect(texte).not.toMatch(/contenu est conservé|rien n'a été supprimé|restent visibles/i);

  await tete.click();
  await page.waitForTimeout(300);
  await expect(page.locator("#passionArchiveToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#passionArchiveList")).toBeHidden();

  await page.locator("#passionArchiveToggle").click();
  await page.waitForTimeout(300);
  await expect(page.locator("#passionArchiveList")).toBeVisible();
});

test("⑨ bis — sans archive, la section n'existe pas (pas de gouttière vide)", async ({ page }) => {
  await poser(page, { vivantes: 2, archivees: 0 });
  await ouvrir(page);
  await expect(page.locator("#passionArchiveBox")).toBeHidden();
});

// ══════════════════════════════════════════════════════════════════════════
// ⑩ « RÉACTIVER » — un seul mot, deux états
// ══════════════════════════════════════════════════════════════════════════
test("⑩ « Réactiver » agit quand c'est possible", async ({ page }) => {
  await poser(page, { vivantes: 2, archivees: 1, changements: 1 });
  await ouvrir(page);

  const bouton = page.locator("#passionArchiveBox [data-v8-restaurer]").first();
  await expect(bouton).toHaveText("Réactiver");
  await expect(bouton).toBeEnabled();
  await expect(bouton).toHaveAttribute("data-v8-reactivation", "ouverte");
  // Aucun motif affiché tant que rien ne bloque.
  await expect(page.locator("[data-passion-reactivation]")).toHaveCount(0);

  await bouton.click();
  await page.waitForTimeout(600);
  const apres = await page.evaluate(() => ({
    vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
    archivees: (state.user.profiles || []).filter((p) => p.archived).length,
  }));
  expect(apres.vivantes, "la réactivation n'a rien fait").toBe(3);
  expect(apres.archivees).toBe(0);
});

test("⑩ bis — impossible : le bouton est désarmé, et il dit pourquoi", async ({ page }) => {
  // Plafond atteint ET quota épuisé : reprendre demanderait d'en archiver une
  // autre, ce qui coûte le changement qu'on n'a plus.
  await poser(page, { vivantes: 3, archivees: 1, changements: 3 });
  await ouvrir(page);

  const bouton = page.locator("#passionArchiveBox [data-v8-restaurer]").first();
  await expect(bouton).toHaveText("Réactiver");
  await expect(bouton).toBeDisabled();
  await expect(bouton).toHaveAttribute("data-v8-reactivation", "bloquee");
  await expect(page.locator("#passionArchiveBox [data-passion-reactivation]"))
    .toHaveText("Réactivation possible lorsqu'un changement sera disponible.");

  // ⚠️ ET LE MOTEUR TIENT AUSSI. Un bouton `disabled` n'envoie pas son
  // `onclick`, mais la garde ne peut pas vivre dans le seul affichage : appelée
  // directement, `restaurerPassion` ne doit pas ramener la passion en douce.
  const force = await page.evaluate(() => {
    const arch = (state.user.profiles || []).find((p) => p.archived);
    restaurerPassion(arch.id);
    return {
      toujoursArchivee: !!(state.user.profiles || []).find((p) => p.id === arch.id).archived,
      vivantes: (state.user.profiles || []).filter((p) => !p.archived).length,
    };
  });
  expect(force.toujoursArchivee, "le plafond a laissé passer une réactivation").toBe(true);
  expect(force.vivantes).toBe(3);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑪ LES MOTS QUI NE DOIVENT PLUS ÊTRE LÀ
// ══════════════════════════════════════════════════════════════════════════
test("⑪ la page ne dit plus « Choisis jusqu'à N passions… »", async ({ page }) => {
  await poser(page, { vivantes: 3, archivees: 1, changements: 3 });
  await ouvrir(page);
  const texte = (await page.locator("#passionManager").textContent()) || "";
  expect(texte, "la consigne d'onboarding a resurgi sur la page de gestion")
    .not.toMatch(/Choisis\s+(?:jusqu|\d)/i);
  // La promesse d'ADR-010, elle, RESTE — et de façon permanente.
  await expect(page.locator("#profilesModeleSub")).toBeVisible();
  await expect(page.locator("#profilesModeleSub")).toContainText("Un seul profil, plusieurs passions");
});

// ══════════════════════════════════════════════════════════════════════════
// ⑫ L'AIDE DU « ? » — c'est elle qui porte la règle
// ══════════════════════════════════════════════════════════════════════════
test("⑫ le « ? » explique qu'aucune passion n'est principale", async ({ page }) => {
  await poser(page, { vivantes: 3, changements: 1 });
  await ouvrir(page);
  await page.locator("#aidePassionManager").click();
  await page.waitForTimeout(400);
  const modale = page.locator("#modalContent");
  await expect(modale).toBeVisible();
  await expect(modale).toContainText("Aucune passion n'est principale");
  await expect(modale).toContainText("au moment de publier");
  // La garantie retirée de la liste des archives se retrouve ICI.
  await expect(modale).toContainText("Archiver ne supprime rien");
});

// ══════════════════════════════════════════════════════════════════════════
// ⑬ TÉLÉMÉTRIE ET SENTINELLE
// ══════════════════════════════════════════════════════════════════════════
// ⚠️ CE QUE CE CAS ATTRAPE VRAIMENT : une clé de `meta` qui percute le filtre
// PII de `js/telemetry.js` disparaît EN SILENCE (la liste noire contient
// « pass », « name », « label »…). L'audit `npm run audit:telemetry-keys` le
// vérifie statiquement ; ici on vérifie que l'événement PART, et sous quel nom.
test("⑬ l'ouverture de la page est remontée au Centre de pilotage", async ({ page }) => {
  await poser(page, { vivantes: 3, archivees: 1, changements: 3 });
  await page.evaluate(() => {
    window.__telPage = [];
    window.tel = window.tel || {};
    window.tel.action = (nom, meta) => window.__telPage.push({ nom, meta });
    window.tel.error = (e, ctx) => window.__telPage.push({ nom: "ERREUR", meta: ctx });
  });
  await ouvrir(page);
  await page.locator("#passionArchiveToggle").click();
  await page.waitForTimeout(300);

  const vus = await page.evaluate(() => window.__telPage);
  const ouverture = vus.find((e) => e.nom === "passions_page_ouverte");
  expect(ouverture, "l'ouverture de la page n'est pas tracée").toBeTruthy();
  expect(ouverture.meta.actives).toBe(3);
  expect(ouverture.meta.archivees).toBe(1);
  expect(ouverture.meta.plafond).toBe(true);
  expect(vus.some((e) => e.nom === "passions_archives_repli"),
    "le repli des archives n'est pas tracé").toBe(true);
  // ⚠️ AUCUNE CLÉ SENSIBLE : pas de nom de passion, pas de libellé, pas de
  // pseudo. Le pilotage compte, il ne fiche pas.
  for (const e of vus) {
    for (const k of Object.keys(e.meta || {})) {
      expect(k, "clé de télémétrie interceptée par le filtre PII")
        .not.toMatch(/pass|name|label|user|bio|mail/i);
    }
  }
});

// La Sentinelle lit les ERREURS, pas les écrans vides. Un rendu qui casse doit
// remonter comme une erreur — sinon la page s'affiche à moitié et personne ne
// l'apprend.
test("⑬ bis — un rendu qui casse remonte en erreur, pas en écran vide", async ({ page }) => {
  await poser(page, { vivantes: 2 });
  const vu = await page.evaluate(() => {
    window.__telErr = [];
    window.tel = window.tel || {};
    window.tel.error = (e, ctx) => window.__telErr.push(ctx && ctx.action);
    const vrai = window.renderPassionArchiveBox;
    window.renderPassionArchiveBox = () => { throw new Error("panne simulée"); };
    let leve = false;
    try { togglePassionArchive(); } catch (e) { leve = true; }
    window.renderPassionArchiveBox = vrai;
    return { leve, remontees: window.__telErr };
  });
  expect(vu.leve, "la panne a traversé et cassé le reste de la page").toBe(false);
  expect(vu.remontees, "la panne n'a pas été remontée à la Sentinelle")
    .toContain("passions_page_archive_repli");
});

// ══════════════════════════════════════════════════════════════════════════
// ⑭ MOBILE — Android et iPhone, du plus étroit au plus large
// ══════════════════════════════════════════════════════════════════════════
for (const largeur of [320, 360, 390, 430]) {
  test("⑭ " + largeur + " px : aucun débordement, cibles ≥ 44 px", async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 });
    await poser(page, { vivantes: 3, archivees: 2, changements: 3 });
    await ouvrir(page);

    const vu = await page.evaluate(() => {
      const ec = document.getElementById("passionManager");
      const debordent = [...ec.querySelectorAll("*")]
        .filter((n) => n.offsetParent)
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)).length;
      const cible = (sel) => {
        const n = document.querySelector(sel);
        return n ? Math.round(n.getBoundingClientRect().height) : 0;
      };
      return {
        debordent,
        pageLarge: document.documentElement.scrollWidth <= window.innerWidth + 1,
        retour: cible("#fermerPassionManager"),
        aide: cible("#aidePassionManager"),
        porte: cible("#nouveauProfilLien"),
        repli: cible("#passionArchiveToggle"),
        menu: cible("#profileList .profile-dots-btn"),
        // Le titre ne se fait pas écraser entre ses deux cibles.
        titre: Math.round(document.getElementById("passionManagerTitre").getBoundingClientRect().width),
      };
    });
    expect(vu.debordent, "des éléments de la page débordent de l'écran").toBe(0);
    expect(vu.pageLarge, "la page fait défiler horizontalement").toBe(true);
    expect(vu.retour, "cible tactile du retour").toBeGreaterThanOrEqual(44);
    expect(vu.aide, "cible tactile de l'aide").toBeGreaterThanOrEqual(44);
    expect(vu.porte, "cible tactile de la porte d'ajout").toBeGreaterThanOrEqual(44);
    expect(vu.repli, "cible tactile du repli des archives").toBeGreaterThanOrEqual(44);
    expect(vu.menu, "cible tactile du menu d'une carte").toBeGreaterThanOrEqual(40);
    expect(vu.titre, "le titre est écrasé par ses deux cibles").toBeGreaterThan(120);
  });
}
