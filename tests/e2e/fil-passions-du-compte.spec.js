// ══════════════════════════════════════════════════════════════════════════
// LES PASSIONS DU FIL SONT CELLES DU COMPTE (2026-09-18)
// ──────────────────────────────────────────────────────────────────────────
// Rapport de Benjamin, deux captures : le rail du Fil peignait « Suivis ·
// Metallerie · Course à pied · Wakeboard · Ski freestyle · … », le Profil
// disait « 3 PASSIONS ». Mesuré en base (canal ① d'ADR-012) sur le compte de
// la capture : `user.profiles` = 3 vivantes, `selectedFeedPassions` = 7 — les
// quatre de trop sont des intérêts d'exploration jamais attachés au compte.
//
// Règle verrouillée ici : pour un COMPTE qui possède des passions, les
// intérêts du Fil sont un sous-ensemble des passions possédées, la borne vit
// dans `setFeedPassions` (seul point d'écriture), le rail du Fil ne rajoute
// rien à l'affichage, et les choix d'un visiteur DEVIENNENT les passions du
// compte qu'il crée (bornés par `PASSIONS_OFFERTES`). Un visiteur, lui, garde
// ses intérêts libres : il n'a pas de compte.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { bootVisiteur } = require("./first-run-helper");

// Le compte de la capture, transposé sur des identifiants du socle embarqué
// (« metallerie » est une passion créée en production, absente du référentiel
// livré) : trois passions vivantes, le remplissage de boot() archivé, et une
// sélection de fil qui porte quatre intérêts de plus que le compte.
const POSSEDEES = ["musique", "sport", "cuisine"];
const ORPHELINES = ["photo", "voyage", "moto", "art"];
function etatCapture() {
  return {
    onboarded: true, landingSeen: true, tourSeen: true,
    user: {
      name: "Benjamin", birthYear: 1990, isMinor: false,
      currentProfileId: "pp_1",
      profiles: [
        { id: "pp_0", name: "Benjamin", passion: "yoga", emoji: "🧘", archived: true, _parDefaut: true, createdAt: 1 },
        { id: "pp_1", name: "Benjamin", passion: "musique", emoji: "🎵", createdAt: 2 },
        { id: "pp_2", name: "Benjamin", passion: "sport", emoji: "🏃", createdAt: 3 },
        { id: "pp_3", name: "Benjamin", passion: "cuisine", emoji: "🍳", createdAt: 4 },
      ],
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
      following: [], general: { username: "Benjamin" },
    },
    userPosts: [], userEvents: [], notifications: [],
    currentMood: "all",
    selectedFeedPassions: ORPHELINES.concat(POSSEDEES),
    feedInterestsMigrated: true, feedFollowingOn: true,
  };
}

async function boot(page, etat) {
  await bootOnboarded(page, null, 3, { state: etat || etatCapture() });
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    window.supaUpsertProfile = async () => {};
    window.supaInit = () => {};
  });
}

// Les bulles de passion du rail du FIL, hors « Suivis ».
const bullesFil = (page) => page.evaluate(() => {
  const rail = document.getElementById("profileStrip");
  if (rail) rail._lastHtml = null;
  goTo("feed");
  renderProfileStrip();
  return Array.from(document.querySelectorAll("#profileStrip [data-passion-tile]"))
    .map((t) => t.getAttribute("data-passion-tile"))
    .filter((k) => k !== "__suivis__");
});

// Les bulles du rail du PROFIL.
const bullesProfil = (page) => page.evaluate(() => {
  goTo("profiles");
  renderProfilesScreen();
  return Array.from(document.querySelectorAll("#v9ProfilePassions [data-passion-tile]"))
    .map((t) => t.getAttribute("data-passion-tile"));
});

test("① l'état de la capture : le Fil et le Profil comptent les MÊMES passions", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({
    runtime: Array.from(_activeFeedPassions),
    persiste: state.selectedFeedPassions.slice(),
    vivantes: nbPassionsVivantes(),
  }));
  // Les quatre intérêts orphelins sont partis à la restauration, les trois
  // passions possédées restent — dans l'ordre de la sélection persistée.
  expect(r.runtime).toEqual(POSSEDEES);
  expect(r.persiste).toEqual(POSSEDEES);
  expect(r.vivantes).toBe(3);

  const fil = await bullesFil(page);
  const profil = await bullesProfil(page);
  expect(fil.slice().sort()).toEqual(POSSEDEES.slice().sort());
  // ⚠️ Le rail du Profil porte l'ID de l'entrée (pp_n), celui du Fil la passion :
  // on compare les NOMBRES, qui sont ce que Benjamin a vu diverger.
  expect(profil.length).toBe(fil.length);
  ORPHELINES.forEach((id) => expect(fil).not.toContain(id));
});

test("① bis — l'assainissement est PERSISTÉ : le stockage local ne porte plus les orphelines", async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(700);   // saveState est débouncé à 250 ms
  const stocke = await page.evaluate(() => JSON.parse(localStorage.getItem("passio_mvp_state_v1") || "null"));
  expect(stocke).not.toBeNull();
  expect(stocke.selectedFeedPassions).toEqual(POSSEDEES);
});

test("② `setFeedPassions` est la borne : un compte ne peut pas cocher une passion qu'il ne possède pas", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const rendu = setFeedPassions(["photo", "sport", "moto", "musique"]);
    return { rendu, runtime: Array.from(_activeFeedPassions), persiste: state.selectedFeedPassions.slice() };
  });
  // L'ordre de sélection est conservé, les inconnues du compte sont écartées.
  expect(r.rendu).toEqual(["sport", "musique"]);
  expect(r.runtime).toEqual(["sport", "musique"]);
  expect(r.persiste).toEqual(["sport", "musique"]);
});

test("② bis — décocher et recocher une passion possédée reste possible (le rail est une commande de lecture)", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => toggleProfileFilter("sport"));
  expect(await page.evaluate(() => Array.from(_activeFeedPassions))).toEqual(["musique", "cuisine"]);
  // Décochée, la bulle reste — grisée — pour pouvoir la recocher.
  expect(await bullesFil(page)).toContain("sport");
  await page.evaluate(() => toggleProfileFilter("sport"));
  expect(await page.evaluate(() => Array.from(_activeFeedPassions).sort())).toEqual(["cuisine", "musique", "sport"]);
});

test("③ le rail du Fil ne rajoute AUCUNE bulle pour un compte, même si le Set est pollué en dehors de l'autorité", async ({ page }) => {
  await boot(page);
  const fil = await page.evaluate(() => {
    // Contournement délibéré de `setFeedPassions` : c'est le rendu qu'on mesure.
    _activeFeedPassions.add("photo");
    const rail = document.getElementById("profileStrip");
    if (rail) rail._lastHtml = null;
    goTo("feed");
    renderProfileStrip();
    return Array.from(document.querySelectorAll("#profileStrip [data-passion-tile]"))
      .map((t) => t.getAttribute("data-passion-tile"));
  });
  expect(fil).not.toContain("photo");
  expect(fil).not.toContain("_interet_photo");
  expect(fil.filter((k) => k !== "__suivis__").length).toBe(3);
});

test("④ un VISITEUR garde ses intérêts libres, et le rail les peint sans profil", async ({ page }) => {
  await bootVisiteur(page, { sansBienvenue: true });
  const r = await page.evaluate(() => {
    setFeedPassions(["moto", "photo"]);
    const rail = document.getElementById("profileStrip");
    if (rail) rail._lastHtml = null;
    goTo("feed");
    renderProfileStrip();
    return {
      compte: comptePassioReel(),
      borne: interetsBornesAuCompte(),
      runtime: Array.from(_activeFeedPassions),
      bulles: Array.from(document.querySelectorAll("#profileStrip [data-passion-tile]"))
        .map((t) => t.getAttribute("data-passion-tile")),
    };
  });
  expect(r.compte).toBe(false);
  expect(r.borne).toBe(false);
  expect(r.runtime).toEqual(["moto", "photo"]);
  expect(r.bulles).toContain("moto");
  expect(r.bulles).toContain("photo");
});

// ── La migration des choix du visiteur ATTACHE les passions au compte ─────
const PREFS_VISITEUR = {
  v: 1, passions: ["moto", "photo", "voyage", "cuisine"], specialites: [],
  intents: [], tour: {}, bienvenue: "vue", retour: null, migre: false, debut: 1,
};

test("⑤ un compte NEUF reçoit les choix du visiteur comme PASSIONS, bornées à PASSIONS_OFFERTES, et le remplissage cède la place", async ({ page }) => {
  await bootVisiteur(page, { prefs: PREFS_VISITEUR, sansBienvenue: true });
  const r = await page.evaluate(() => {
    window._comptePassionsServeur = false;   // compte neuf : rien à défendre
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    // Exactement ce que fabrique `boot()` quand le serveur ne rend rien.
    state.user.profiles = [{ id: "pp_0", name: "Moi", passion: "musique", emoji: "🎸", createdAt: 1, _parDefaut: true }];
    state.user.currentProfileId = "pp_0";
    state.selectedFeedPassions = ["musique"];
    state.onboarded = true;
    const migre = PassioFirstRun.migrerPreferences();
    const vivantes = state.user.profiles.filter((p) => !p.archived);
    return {
      migre,
      offertes: PASSIONS_OFFERTES,
      passions: vivantes.map((p) => p.passion),
      remplissage: state.user.profiles.some((p) => p._parDefaut),
      courant: (state.user.profiles.find((p) => p.id === state.user.currentProfileId) || {}).passion,
      interets: Array.from(_activeFeedPassions),
      persiste: state.selectedFeedPassions.slice(),
      nb: nbPassionsVivantes(),
    };
  });
  expect(r.migre).toBe(true);
  expect(r.offertes).toBe(3);
  // Les trois PREMIERS choix, dans l'ordre ; le quatrième bute sur le plafond.
  expect(r.passions).toEqual(["moto", "photo", "voyage"]);
  expect(r.remplissage).toBe(false);
  expect(r.courant).toBe("moto");            // la passion de départ = le premier choix
  expect(r.interets).toEqual(["moto", "photo", "voyage"]);
  expect(r.persiste).toEqual(["moto", "photo", "voyage"]);
  expect(r.nb).toBe(3);
});

test("⑤ bis — après la migration, le Fil et le Profil comptent pareil, et « cuisine » écartée n'est nulle part", async ({ page }) => {
  await bootVisiteur(page, { prefs: PREFS_VISITEUR, sansBienvenue: true });
  const r = await page.evaluate(() => {
    window._comptePassionsServeur = false;
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    state.user.profiles = [];
    state.onboarded = true;
    PassioFirstRun.migrerPreferences();
    const rail = document.getElementById("profileStrip");
    if (rail) rail._lastHtml = null;
    goTo("feed");
    renderProfileStrip();
    const fil = Array.from(document.querySelectorAll("#profileStrip [data-passion-tile]"))
      .map((t) => t.getAttribute("data-passion-tile")).filter((k) => k !== "__suivis__");
    goTo("profiles");
    renderProfilesScreen();
    const profil = Array.from(document.querySelectorAll("#v9ProfilePassions [data-passion-tile]")).length;
    return { fil, profil };
  });
  expect(r.fil.slice().sort()).toEqual(["moto", "photo", "voyage"]);
  expect(r.profil).toBe(3);
  expect(r.fil).not.toContain("cuisine");
});

test("⑥ l'onboarding V2 crée UNE passion du compte PAR choix, et n'en laisse cocher que PASSIONS_OFFERTES", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    window.PASSIO_ONBOARDING_V2 = true;
    state.user.name = "QA";
    selectedPassions.length = 0;
    selectedPassions.push("photo", "voyage", "moto");
    onbFinish();
    return {
      max: onbMaxPassions(),
      profils: state.user.profiles.map((p) => p.passion),
      interets: Array.from(_activeFeedPassions),
      courant: (state.user.profiles.find((p) => p.id === state.user.currentProfileId) || {}).passion,
    };
  });
  expect(r.max).toBe(3);
  expect(r.profils).toEqual(["photo", "voyage", "moto"]);
  expect(r.interets).toEqual(["photo", "voyage", "moto"]);
  expect(r.courant).toBe("photo");

  // Au-delà du plafond, la porte (togglePassion) refuse, et onbFinish borne
  // même une liste poussée à la main.
  const r2 = await page.evaluate(() => {
    selectedPassions.length = 0;
    selectedPassions.push("photo", "voyage", "moto");
    togglePassion("art");
    const refusee = selectedPassions.slice();
    selectedPassions.push("art", "yoga");
    onbFinish();
    return { refusee, profils: state.user.profiles.map((p) => p.passion), interets: Array.from(_activeFeedPassions) };
  });
  expect(r2.refusee).toEqual(["photo", "voyage", "moto"]);
  expect(r2.profils).toEqual(["photo", "voyage", "moto"]);
  expect(r2.interets).toEqual(["photo", "voyage", "moto"]);
});

test("⑦ câblage à la SOURCE : la borne est dans setFeedPassions, restoreFeedPassions la persiste, le rejeu réseau la rejoue", async ({ page }) => {
  await boot(page);
  const src02 = await page.evaluate(async () => (await fetch("/js/app-02-state-utils.js")).text());
  const src06 = await page.evaluate(async () => (await fetch("/js/app-06-reels-partage.js")).text());
  const srcFr = await page.evaluate(async () => (await fetch("/js/first-run.js")).text());
  // ① la borne vit dans le corps de setFeedPassions
  const corps = src02.slice(src02.indexOf("function setFeedPassions("), src02.indexOf("function restoreFeedPassions("));
  expect(corps).toContain("interetsBornesAuCompte()");
  // ② le rejeu de lecture réinstalle le Set depuis le blob rejoué
  const reprise = src02.slice(src02.indexOf("async function _repriseUserState("), src02.indexOf("function _noterRepriseUserState("));
  expect(reprise).toContain("restoreFeedPassions()");
  // ③ le rail du Fil n'ajoute des orphelines que hors compte
  const rail = src06.slice(src06.indexOf("function renderProfileStrip("), src06.indexOf("function renderProfileStrip(") + 4000);
  expect(rail).toMatch(/interetsBornesAuCompte\(\)/);
  // ④ la migration attache par le SEUL moteur d'ajout
  const migration = srcFr.slice(srcFr.indexOf("function migrerPreferences("), srcFr.indexOf("function attacherPassionsAuCompte(") + 3000);
  expect(migration).toContain("attacherPassionsAuCompte(choix)");
  expect(migration).toContain("ajouterPassionAuCompte(id, \"\")");
});
