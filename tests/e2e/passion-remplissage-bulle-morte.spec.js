// ══════════════════════════════════════════════════════════════════════════
// LE PROFIL DE REMPLISSAGE PEIGNAIT UNE BULLE QUE TAPER NE FAISAIT RIEN
// (2026-09-22)
// ──────────────────────────────────────────────────────────────────────────
// Rapport de Benjamin, capture à l'appui : « je viens de rajouter une passion
// (musique) sur mon profil mais je n'arrive pas à la sélectionner ». Le rail
// du Fil peint « Suivis · Musique (grisée) · Metallerie · Course à pied ·
// Wakeboard » ; taper « Musique » ne change rien, et rien ne se prononce.
//
// MESURÉ EN PRODUCTION le jour même (canal ① d'ADR-012), sur le compte de la
// capture : `user.profiles` porte bien une entrée « musique », et elle porte
// `_parDefaut: true` — c'est le profil de REMPLISSAGE fabriqué par `boot()`
// quand le serveur ne rend aucun profil (`allPassions()[0]` = « Musique »),
// pas une passion choisie. `selectedFeedPassions` ne la contient pas.
//
// DEUX DÉFAUTS, ET IL FALLAIT LES DEUX POUR PRODUIRE LE SYMPTÔME :
//   ① `passionsVivantes()` (app-06) ne l'excluait pas → la bulle était PEINTE ;
//      mais `passionsPossedeesIds()` (app-02) l'exclut, donc `setFeedPassions`
//      JETAIT l'identifiant à chaque tap. Une promesse d'affichage que
//      l'écriture refuse : le rail se repeignait à l'identique, sans un mot.
//      « Un refus qui ne se prononce pas est indiscernable d'une panne » —
//      et ici il n'y avait même rien à refuser, la bulle n'aurait pas dû exister.
//   ② `ajouterPassionAuCompte()` prenait le remplissage pour une possession
//      (`_existante`) : aller l'ajouter dans « Mes passions » rendait « déjà
//      là », donc AUCUNE écriture et le marqueur intact. Le seul geste qui
//      pouvait réparer la situation était muet.
//
// Règle verrouillée ici : le remplissage n'est une passion NULLE PART — ni
// peint, ni compté dans le plafond, ni passion d'écriture — et « ajouter »
// cette passion-là le PROMEUT (le marqueur tombe) au lieu de ne rien faire.
// Un compte qui n'a QUE son remplissage garde sa bulle : le repli est intact.
// ══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const RACINE = path.join(__dirname, "..", "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, "js", f), "utf8");

// L'état de la capture, transposé sur des identifiants du socle embarqué
// (« metallerie » et « glisse-wakeboard » sont absents du référentiel livré) :
// le remplissage « musique » VIVANT, plus trois passions réellement choisies.
const POSSEDEES = ["sport", "cuisine", "photo"];
function etatCapture(extra) {
  return Object.assign({
    onboarded: true, landingSeen: true, tourSeen: true,
    user: {
      name: "Benjamin", birthYear: 1990, isMinor: false,
      // ⚠️ Le remplissage est le PREMIER profil et la passion d'écriture, comme
      // en production : c'est `profiles[0]` que `boot()` désignait.
      currentProfileId: "pp_0",
      profiles: [
        { id: "pp_0", name: "Benjamin", passion: "musique", emoji: "🎵", _parDefaut: true, createdAt: 1 },
        { id: "pp_1", name: "Benjamin", passion: "sport", emoji: "🏃", createdAt: 2 },
        { id: "pp_2", name: "Benjamin", passion: "cuisine", emoji: "🍳", createdAt: 3 },
        { id: "pp_3", name: "Benjamin", passion: "photo", emoji: "📷", createdAt: 4 },
      ],
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
      following: [], general: { username: "Benjamin" },
    },
    userPosts: [], userEvents: [], notifications: [],
    currentMood: "all",
    selectedFeedPassions: POSSEDEES.slice(),
    feedInterestsMigrated: true, feedFollowingOn: true,
  }, extra || {});
}

async function boot(page, etat) {
  await bootOnboarded(page, null, 4, { state: etat || etatCapture() });
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

test("① l'état EXACT de la capture : la bulle « Musique » n'est plus peinte", async ({ page }) => {
  await boot(page);
  const fil = await bullesFil(page);
  expect(fil).not.toContain("musique");
  expect(fil.slice().sort()).toEqual(POSSEDEES.slice().sort());

  // Et la même chose à l'autorité : `passionsVivantes()` est ce que peignent
  // AUSSI le rail du Profil, le sélecteur du Studio, la création de groupe et
  // l'organisation d'une activité — quatre surfaces, une seule liste.
  const vivantes = await page.evaluate(() => passionsVivantes().map((p) => p.passion));
  expect(vivantes).not.toContain("musique");
  expect(vivantes.slice().sort()).toEqual(POSSEDEES.slice().sort());
});

test("② AUCUNE bulle peinte n'est refusée par l'écriture — c'est le défaut même", async ({ page }) => {
  await boot(page);
  // La promesse que le lot verrouille : tout ce que le rail montre, le point
  // d'écriture l'accepte. C'est la formulation générale du défaut, elle vaut
  // pour toute bulle future, pas seulement pour le remplissage.
  const r = await page.evaluate(() => {
    const peintes = Array.from(document.querySelectorAll("#profileStrip [data-passion-tile]"))
      .map((t) => t.getAttribute("data-passion-tile"))
      .filter((k) => k !== "__suivis__");
    setFeedPassions(peintes);
    return { peintes, retenues: Array.from(_activeFeedPassions) };
  });
  expect(r.peintes.length).toBeGreaterThan(0);
  expect(r.retenues.slice().sort()).toEqual(r.peintes.slice().sort());
});

test("③ « Ajouter Musique » PROMEUT le remplissage au lieu d'être muet", async ({ page }) => {
  // Une place reste libre (2 possédées sur 3) : l'ajout doit aboutir.
  const etat = etatCapture();
  etat.user.profiles = etat.user.profiles.slice(0, 3);   // remplissage + sport + cuisine
  etat.selectedFeedPassions = ["sport", "cuisine"];
  await boot(page, etat);

  const r = await page.evaluate(() => {
    const rendu = ajouterPassionAuCompte("musique");
    const entrees = state.user.profiles.filter((p) => p.passion === "musique");
    return {
      rendu: !!rendu,
      // UNE seule entrée : on promeut, on ne duplique pas.
      nbEntrees: entrees.length,
      marqueur: entrees.length ? !!entrees[0]._parDefaut : null,
      memeObjet: entrees.length ? entrees[0].id === "pp_0" : null,
      possedees: passionsPossedeesIds(),
      fil: Array.from(_activeFeedPassions),
      vivantes: passionsVivantes().map((p) => p.passion),
    };
  });
  expect(r.rendu).toBe(true);
  expect(r.nbEntrees).toBe(1);
  expect(r.marqueur).toBe(false);
  expect(r.memeObjet).toBe(true);
  expect(r.possedees).toContain("musique");
  expect(r.fil).toContain("musique");
  expect(r.vivantes).toContain("musique");

  // Et elle est désormais SÉLECTIONNABLE : le geste que Benjamin ne pouvait
  // pas faire. On décoche puis on recoche par le point d'écriture réel.
  const sel = await page.evaluate(() => {
    setFeedPassions(["sport"]);
    setFeedPassions(["sport", "musique"]);
    return Array.from(_activeFeedPassions);
  });
  expect(sel).toEqual(["sport", "musique"]);
});

test("④ au plafond, l'ajout REFUSE et se prononce — il ne promeut rien en douce", async ({ page }) => {
  await boot(page);   // 3 possédées = PASSIONS_OFFERTES
  const r = await page.evaluate(() => {
    let paywall = 0;
    const vrai = window.openPassionPaywall;
    window.openPassionPaywall = function () { paywall++; };
    const rendu = ajouterPassionAuCompte("musique");
    window.openPassionPaywall = vrai;
    const e = state.user.profiles.find((p) => p.passion === "musique");
    return { rendu, paywall, marqueur: !!(e && e._parDefaut), possedees: passionsPossedeesIds() };
  });
  expect(r.rendu).toBeNull();
  expect(r.paywall).toBe(1);
  expect(r.marqueur).toBe(true);          // toujours un remplissage
  expect(r.possedees).not.toContain("musique");
});

test("⑤ le remplissage ne consomme plus une des trois places offertes", async ({ page }) => {
  const etat = etatCapture();
  etat.user.profiles = etat.user.profiles.slice(0, 3);   // remplissage + 2 possédées
  await boot(page, etat);
  const r = await page.evaluate(() => ({
    vivantes: nbPassionsVivantes(),
    restantes: passionsRestantesOffertes(),
    plein: plafondPassionsAtteint(),
    offertes: PASSIONS_OFFERTES,
  }));
  // Deux possédées sur trois : une place reste. Avant, le remplissage en
  // mangeait une et la porte d'ajout refusait la troisième passion.
  expect(r.vivantes).toBe(2);
  expect(r.restantes).toBe(r.offertes - 2);
  expect(r.plein).toBe(false);
});

test("⑥ un compte qui n'a QUE son remplissage garde sa bulle — le repli est intact", async ({ page }) => {
  const etat = etatCapture();
  etat.user.profiles = [etat.user.profiles[0]];
  etat.selectedFeedPassions = [];
  await boot(page, etat);
  const r = await page.evaluate(() => ({
    vivantes: passionsVivantes().map((p) => p.passion),
    // Sans possession, la borne de `setFeedPassions` ne s'applique pas : le
    // remplissage reste cochable, exactement comme avant le lot.
    retenues: (setFeedPassions(["musique"]), Array.from(_activeFeedPassions)),
  }));
  expect(r.vivantes).toEqual(["musique"]);
  expect(r.retenues).toEqual(["musique"]);
});

test("⑦ on ne peut pas ranger sa DERNIÈRE vraie passion en s'appuyant sur le remplissage", async ({ page }) => {
  const etat = etatCapture();
  etat.user.profiles = etat.user.profiles.slice(0, 2);   // remplissage + sport
  etat.selectedFeedPassions = ["sport"];
  await boot(page, etat);
  const r = await page.evaluate(() => {
    const avant = passionsPossedeesIds().slice();
    const ok = archiverPassion("pp_1");
    // ⚠️ On lit `currentProfile()`, l'AUTORITÉ, et non `currentProfileId` :
    // la garde est une lecture, elle ne déplace rien (voir app-02).
    return { avant, ok, apres: passionsPossedeesIds(), ecriture: (currentProfile() || {}).passion };
  });
  expect(r.avant).toEqual(["sport"]);
  expect(r.ok).toBe(false);               // refusé : deux « vivantes » dont un remplissage
  expect(r.apres).toEqual(["sport"]);
  expect(r.ecriture).toBe("sport");       // la passion d'écriture n'est pas le remplissage
});

test("⑧ à la SOURCE : `boot()` ne désigne pas le remplissage comme passion d'écriture", async () => {
  // Ce chemin n'est pas parcouru par un banc local (il vit dans la branche
  // Supabase de `boot()`), et c'est très exactement pour ça qu'il se mesure à
  // la source — leçon `_notifierMessage`.
  const src = lire("app-08-ui-modals-tour.js");
  const i = src.indexOf("state.user.currentProfileId = (state.user.profiles.find(");
  expect(i).toBeGreaterThan(0);
  const bloc = src.slice(i, src.indexOf(").id;", i));
  expect(bloc).toContain("!p._parDefaut");

  // Et les trois autorités portent bien l'exclusion.
  const app06 = lire("app-06-reels-partage.js");
  const apres = (nom) => {
    const j = app06.indexOf("function " + nom + "(");
    expect(j).toBeGreaterThan(0);
    return app06.slice(j, app06.indexOf("\n}", j));
  };
  expect(apres("passionsVivantes")).toMatch(/_estRemplissagePassion|_parDefaut/);
  expect(apres("nbPassionsVivantes")).toContain("_parDefaut");
  expect(apres("ajouterPassionAuCompte")).toContain("_estRemplissagePassion");
});

// ══════════════════════════════════════════════════════════════════════════
// LES SIX SURFACES QUE LE PREMIER JET AVAIT OUBLIÉES (relevées par
// `audit-passio` APRÈS que les huit cas ci-dessus étaient verts)
// ──────────────────────────────────────────────────────────────────────────
// « Corriger une surface, c'est corriger une surface. » Le premier correctif
// redressait `passionsVivantes`, `nbPassionsVivantes` et `ajouterPassionAuCompte`
// — et six autres endroits lisaient encore `state.user.profiles` BRUT. Trois
// d'entre eux devenaient faux À CAUSE du lot : c'est le mode d'échec à retenir,
// un correctif qui déplace une règle doit être suivi partout où l'ancienne
// servait. Le cas ⑦ ci-dessus était d'ailleurs VERT sur le premier d'entre eux :
// il appelait `archiverPassion` à la main, jamais sa porte.
// ══════════════════════════════════════════════════════════════════════════

test("⑨ la PORTE d'archivage compte comme le POINT D'ÉCRITURE — mesuré par le GESTE", async ({ page }) => {
  const etat = etatCapture();
  etat.user.profiles = etat.user.profiles.slice(0, 2);   // remplissage + sport
  etat.selectedFeedPassions = ["sport"];
  await boot(page, etat);
  const r = await page.evaluate(() => {
    let refus = "";
    const vraiToast = window.toast;
    window.toast = function (m) { refus = String(m || ""); };
    // Le geste réel : la porte, pas la fonction d'écriture.
    confirmArchivePassion("pp_1");
    window.toast = vraiToast;
    const modale = document.querySelector(".modal.active, #modalBackdrop.active");
    return { refus, confirmationOuverte: !!modale, possedees: passionsPossedeesIds() };
  });
  // La porte refuse TOUT DE SUITE, au lieu d'ouvrir une confirmation que le
  // point d'écriture refusera après validation.
  expect(r.refus).toMatch(/au moins une passion active/i);
  expect(r.confirmationOuverte).toBe(false);
  expect(r.possedees).toEqual(["sport"]);
});

test("⑩ au plafond, choisir le remplissage au Studio ne fait pas pointer `#postPassion` dessus", async ({ page }) => {
  await boot(page);   // 3 possédées = plafond
  const r = await page.evaluate(() => {
    const sel = document.getElementById("postPassion");
    if (!sel) return { absent: true };
    sel.innerHTML = '<option value="sport">🏃 Sport</option>';
    sel.value = "sport";
    let paywall = 0;
    const vrai = window.openPassionPaywall;
    window.openPassionPaywall = function () { paywall++; };
    // On pilote la branche de validation du sélecteur du Studio.
    let capte = null;
    const selecteur = window.PassionSearchSelector;
    const vraiOuvrir = selecteur && selecteur.ouvrir;
    if (selecteur) selecteur.ouvrir = function (cfg) { capte = cfg; };
    window.PassioFlatUI.ouvrirChoixStudio();
    if (selecteur) selecteur.ouvrir = vraiOuvrir;
    if (!capte || typeof capte.onValider !== "function") return { pasDeBranche: true };
    capte.onValider(["musique"]);
    window.openPassionPaywall = vrai;
    return {
      valeur: sel.value,
      option: Array.prototype.some.call(sel.options, (o) => o.value === "musique"),
      paywall,
      possedees: passionsPossedeesIds(),
    };
  });
  expect(r.absent).toBeFalsy();
  expect(r.pasDeBranche).toBeFalsy();
  expect(r.paywall).toBe(1);              // le mur s'est bien affiché
  expect(r.valeur).toBe("sport");         // …et on publie toujours dans Sport
  expect(r.option).toBe(false);           // l'option orpheline est retirée
  expect(r.possedees).not.toContain("musique");
});

test("⑪ le marqueur SURVIT à l'aller-retour serveur, et ne s'affiche pas aux visiteurs", async ({ page }) => {
  await boot(page);
  // (a) La surface publique le retire — fonction pure, mesurable ici.
  const publiques = await page.evaluate(() => passionsPubliques([
    { id: "musique", _parDefaut: true },
    { id: "sport" },
    { id: "vieille", archived: true },
  ]).map((p) => p.id));
  expect(publiques).toEqual(["sport"]);

  // (b) Le jsonb le PORTE et le boot le RESTITUE — mesuré à la source : ce
  // chemin est celui d'un appareil neuf, qu'aucun banc local ne parcourt.
  const app08 = lire("app-08-ui-modals-tour.js");
  const iPub = app08.indexOf("const _passions = (state.user.profiles || []).map(");
  expect(iPub).toBeGreaterThan(0);
  expect(app08.slice(iPub, iPub + 1800)).toContain("_parDefaut: !!pr._parDefaut");
  const iBoot = app08.indexOf("state.user.profiles = srvPassions.map(");
  expect(iBoot).toBeGreaterThan(0);
  expect(app08.slice(iBoot, iBoot + 2200)).toContain("ps._parDefaut");
});

test("⑫ « Mes passions » : l'en-tête et les cartes comptent pareil", async ({ page }) => {
  const etat = etatCapture();
  etat.user.profiles = [etat.user.profiles[0]];   // QUE le remplissage
  etat.selectedFeedPassions = [];
  await boot(page, etat);
  const r = await page.evaluate(() => {
    goTo("profiles");
    renderProfilesScreen();
    return {
      compteur: nbPassionsVivantes(),
      cartes: document.querySelectorAll("#profileList .v8-passion-card").length,
      resume: (document.getElementById("passionsResume") || {}).textContent || "",
    };
  });
  // Il ne possède rien : le compteur le dit, et aucune carte ne prétend le contraire.
  expect(r.compteur).toBe(0);
  expect(r.cartes).toBe(0);
  expect(r.resume).not.toMatch(/Musique/i);
});

test("⑬ la fenêtre d'échange ne propose pas de « ranger » le remplissage", async ({ page }) => {
  // ⚠️ La branche d'échange n'existe que si la cible est ARCHIVÉE : c'est le
  // geste « je veux reprendre une passion rangée alors que je suis au plafond ».
  const etat = etatCapture();
  etat.user.profiles.push({ id: "pp_4", name: "Benjamin", passion: "voyage", emoji: "✈️", archived: true, createdAt: 5 });
  await boot(page, etat);   // remplissage + 3 possédées vivantes + 1 archivée
  const lignes = await page.evaluate(() => {
    openPassionPaywall({ restaurer: "pp_4" });
    return Array.from(document.querySelectorAll("[data-passion-echange]"))
      .map((n) => n.getAttribute("data-passion-echange"));
  });
  expect(lignes.length).toBeGreaterThan(0);          // l'échange reste proposé
  expect(lignes).not.toContain("pp_0");              // …mais pas sur le remplissage
});

test("⑭ réactiver un remplissage archivé le PROMEUT — un geste payant a un effet", async ({ page }) => {
  const etat = etatCapture();
  etat.user.profiles[0].archived = true;             // remplissage rangé
  etat.user.profiles = etat.user.profiles.slice(0, 3); // + sport + cuisine (une place libre)
  etat.selectedFeedPassions = ["sport", "cuisine"];
  await boot(page, etat);
  const r = await page.evaluate(() => {
    const ok = restaurerPassion("pp_0", true);
    const e = state.user.profiles.find((p) => p.id === "pp_0");
    return {
      ok,
      marqueur: !!(e && e._parDefaut),
      archivee: !!(e && e.archived),
      possedees: passionsPossedeesIds(),
      vivantes: passionsVivantes().map((p) => p.passion),
    };
  });
  expect(r.ok).toBe(true);
  expect(r.archivee).toBe(false);
  expect(r.marqueur).toBe(false);                    // promue : elle EXISTE pour de bon
  expect(r.possedees).toContain("musique");
  expect(r.vivantes).toContain("musique");
});

// ══════════════════════════════════════════════════════════════════════════
// LA SEPTIÈME SURFACE — CELLE QUI A TRANSFORMÉ LE CORRECTIF EN CUL-DE-SAC
// ──────────────────────────────────────────────────────────────────────────
// Rapport de Benjamin dans l'heure qui a suivi le déploiement : « la passion
// musique ne fonctionne plus du tout ». Le lot avait retiré la bulle morte
// (juste) et réparé `ajouterPassionAuCompte` pour qu'il PROMEUVE le
// remplissage (juste aussi) — mais `mesPassions()` (passions-flat-ui), lue
// BRUTE, la comptait encore comme possédée, et le `deja` d'`ouvrirAjoutPassions`
// court-circuite le moteur : `if (deja.indexOf(id) >= 0) return;`. Choisir
// « Musique » et valider ne produisait RIEN — ni passion, ni toast, ni refus.
// On était passé d'une bulle qui ne répond pas à une passion INTROUVABLE.
//
// ⚠️ LA LEÇON DÉPASSE LE REMPLISSAGE : réparer un MOTEUR ne sert à rien tant
// qu'un garde EN AMONT décide, sur une AUTRE lecture, qu'il n'y a rien à lui
// demander. C'est le défaut `confirmArchivePassion` du même lot — sauf qu'ici
// le garde n'était même pas dans le même fichier, et qu'aucun des 14 cas ne
// passait par la porte réelle. **Un verrou qui appelle le moteur à la main ne
// mesure pas la porte.**
// ══════════════════════════════════════════════════════════════════════════

test("⑮ le GESTE RÉEL : choisir « Musique » dans « Mes passions » l'ajoute pour de bon", async ({ page }) => {
  const etat = etatCapture();
  etat.user.profiles = etat.user.profiles.slice(0, 3);   // remplissage + sport + cuisine
  etat.selectedFeedPassions = ["sport", "cuisine"];
  await boot(page, etat);

  const r = await page.evaluate(() => {
    // On pilote la porte réelle, pas le moteur : c'est elle qui décidait de
    // ne rien lui demander.
    let capte = null;
    const sel = window.PassionSearchSelector;
    const vrai = sel.ouvrir;
    sel.ouvrir = function (cfg) { capte = cfg; };
    window.PassioFlatUI.ouvrirAjoutPassions();
    sel.ouvrir = vrai;
    if (!capte || typeof capte.onValider !== "function") return { pasDeBranche: true };

    let toasts = [];
    const vraiToast = window.toast;
    window.toast = function (m) { toasts.push(String(m || "")); };
    capte.onValider(["musique"]);
    window.toast = vraiToast;

    const e = state.user.profiles.find((p) => p.passion === "musique");
    return {
      marqueur: !!(e && e._parDefaut),
      possedees: passionsPossedeesIds(),
      vivantes: passionsVivantes().map((p) => p.passion),
      fil: Array.from(_activeFeedPassions),
      toasts,
    };
  });
  expect(r.pasDeBranche).toBeFalsy();
  // La porte ne la considère plus comme déjà possédée : le moteur est appelé,
  // il promeut, et le geste se PRONONCE.
  expect(r.marqueur).toBe(false);
  expect(r.possedees).toContain("musique");
  expect(r.vivantes).toContain("musique");
  expect(r.fil).toContain("musique");
  expect(r.toasts.join(" ")).toMatch(/ajout/i);
});

test("⑮ bis — `mesPassions()` ne compte pas le remplissage : la porte et le moteur lisent pareil", async ({ page }) => {
  await boot(page);   // remplissage + 3 possédées
  const r = await page.evaluate(() => ({
    porte: window.PassioFlatUI.mesPassions().slice().sort(),
    moteur: passionsPossedeesIds().slice().sort(),
  }));
  // La règle générale : la porte d'ajout et le point d'écriture doivent lire
  // la MÊME chose, sinon la porte court-circuite un moteur pourtant réparé.
  expect(r.porte).toEqual(r.moteur);
  expect(r.porte).not.toContain("musique");
});

test("⑩ après un refus au plafond, on ne bascule pas l'écriture sur le remplissage", async ({ page }) => {
  // ⚠️ LE FIXTURE DOIT RENDRE LA BASCULE DÉTECTABLE. Première rédaction :
  // `currentProfileId` valait déjà « pp_0 » (le remplissage), donc un test
  // « avant === après » restait VERT sur le défaut — et `currentProfile()`,
  // qui écarte le remplissage, masquait le reste. On part donc d'une VRAIE
  // passion d'écriture, et on lit l'identifiant BRUT, celui qui est persisté.
  const etat = etatCapture();
  etat.user.currentProfileId = "pp_1";   // « sport », une possession
  await boot(page, etat);                 // 3 possédées = plafond

  const r = await page.evaluate(() => {
    const vrai = window.openPassionPaywall;
    window.openPassionPaywall = function () {};
    const avant = state.user.currentProfileId;
    quickCreateProfile("musique");
    window.openPassionPaywall = vrai;
    return { avant, apres: state.user.currentProfileId, ecriture: (currentProfile() || {}).passion };
  });
  expect(r.avant).toBe("pp_1");
  expect(r.apres).toBe("pp_1");           // le refus n'a rien basculé
  expect(r.ecriture).toBe("sport");       // et surtout pas vers le remplissage
});
