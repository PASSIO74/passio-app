// ADR-010 — l'avatar public d'un compte ne suit PAS la passion active.
//
// POURQUOI CE FICHIER EXISTE. `multi-passion-integrite` ① prétendait déjà couvrir
// cet invariant, et il est resté vert alors que la MOITIÉ du défaut survivait :
// il POSE `general.emoji` ET `general.color` à la main dans son état de départ,
// puis appelle `supaUpsertProfile`. Il testait donc la fonction dans un état
// qu'AUCUN chemin réel ne produit — et n'a pas vu que `general.color` n'était
// assigné nulle part, `git grep "general\.color\s*="` ne rendant rien sur aucune
// branche. `g.color` valant toujours `undefined`, la couleur publiée retombait
// sur celle de la passion ACTIVE.
//
// Ce fichier exerce donc la CHAÎNE RÉELLE :
//   Moto active → saveMainProfile → upsert → bascule Yoga → saveMainProfile →
//   upsert → lecture depuis un second compte.
// Il passe par `saveMainProfile`, jamais par un état fabriqué.
//
// ⚠️ POINTS D'ENTRÉE RÉÉCRITS LE 2026-08-31, assertions conservées. Ce fichier
// observait un `upsert` unique qui republiait tout le profil. Cette opération
// n'existe plus : écrire le profil public passe par `ensure` (insert) puis un
// `update` CIBLÉ. Le faux ne voyait donc plus rien passer, et les trois tests
// échouaient sur une prémisse morte, pas sur l'invariant qu'ils gardent.
// L'invariant, lui, est INCHANGÉ — et il est désormais tenu plus fortement :
// `saveMainProfile` ne transmet même plus l'emoji ni la couleur, donc l'identité
// visuelle publique ne PEUT plus suivre la passion active.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
const { installerFauxProfiles } = require("./faux-profiles");

async function boot(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate(installerFauxProfiles);
  await page.evaluate(() => {
    // Deux passions à l'identité visuelle NETTEMENT différente.
    state.user.profiles = [
      { id: "pp_moto", name: "Ben", passion: "moto", emoji: "🏍", color: "#111111" },
      { id: "pp_yoga", name: "Ben", passion: "yoga", emoji: "🧘", color: "#999999" },
    ];
    state.user.currentProfileId = "pp_moto";
    state.user.general = { username: "Ben" };      // ni emoji ni couleur : état RÉEL d'un compte neuf
    saveState();
  });
}

// Passe par le VRAI formulaire : on renseigne les champs que `saveMainProfile` lit.
async function enregistrerProfil(page, pseudo) {
  await page.evaluate(async (nom) => {
    // `saveMainProfile` appelle `supaSavePublicProfile`, qui garantit d'abord
    // l'existence de la ligne puis fait un update ciblé. Rien à simuler ici.
    if (!document.getElementById("editUsername")) openEditMainProfile();
    const u = document.getElementById("editUsername"); if (u) u.value = nom;
    const b = document.getElementById("editBio"); if (b) b.value = "Bio de test";
    await saveMainProfile();
  }, pseudo);
  await page.waitForTimeout(400);
}

test("l'avatar public ne change pas quand on bascule de passion", async ({ page }) => {
  await boot(page);

  // ── Moto active : premier enregistrement par le vrai formulaire.
  await enregistrerProfil(page, "Ben");
  const enMoto = await page.evaluate(() => window.__rows.find(r => r.id === window.__uid) || window.__rows[0]);
  expect(enMoto, "une ligne profiles existe").toBeTruthy();

  // ── Bascule vers Yoga, puis SECOND enregistrement.
  await page.evaluate(() => { switchToProfile("pp_yoga"); });
  await page.waitForTimeout(300);
  await enregistrerProfil(page, "Ben");
  const enYoga = await page.evaluate(() => window.__rows.find(r => r.id === window.__uid) || window.__rows[0]);

  // ⚠️ LE test. L'emoji ET la couleur publiés doivent être IDENTIQUES.
  // `supaLoadPosts` reconstruit l'avatar de CHAQUE publication depuis cette
  // ligne : si elle bouge, tout l'historique change d'apparence chez les autres.
  expect(enYoga.emoji, "l'emoji public ne suit pas la passion active").toBe(enMoto.emoji);
  expect(enYoga.color, "la couleur publique ne suit pas la passion active").toBe(enMoto.color);

  // ⚠️ ASSERTION AJOUTÉE, plus forte que la précédente. Comparer deux états
  // successifs ne prouve que l'égalité ; on exige désormais qu'AUCUNE écriture
  // n'ait jamais porté l'emoji ou la couleur. Un futur appelant qui les
  // republierait « à l'identique » depuis l'état local ferait resurgir le défaut
  // dès que cet état diverge, sans que la comparaison ci-dessus bronche.
  const champs = await page.evaluate(() =>
    window.__updates.filter(u => u.table === "profiles").flatMap(u => Object.keys(u.patch)));
  expect(champs, "l'identité visuelle n'est jamais republiée par un enregistrement de profil")
    .not.toContain("emoji");
  expect(champs).not.toContain("color");
});

test("un second compte voit le même avatar avant et après la bascule", async ({ page }) => {
  await boot(page);
  await enregistrerProfil(page, "Ben");
  const avant = await page.evaluate(() => Object.assign({}, window.__rows.find(r => r.id === window.__uid) || window.__rows[0]));

  await page.evaluate(() => { switchToProfile("pp_yoga"); });
  await page.waitForTimeout(300);
  await enregistrerProfil(page, "Ben");
  const apres = await page.evaluate(() => Object.assign({}, window.__rows.find(r => r.id === window.__uid) || window.__rows[0]));

  // Ce que voit un VISITEUR, c'est cette ligne — et l'avatar que `supaLoadPosts`
  // en dérive pour chaque publication de l'auteur. On simule sa lecture.
  const vuParUnAutre = await page.evaluate(([a, b]) => {
    const rendu = (row) => ({
      nom: row.username,
      avatar: row.emoji,
      couleur: row.color,
      // Ce que porterait une ANCIENNE publication de ce compte, relue par un tiers.
      avatarDUnVieuxPost: row.emoji,
    });
    return { avant: rendu(a), apres: rendu(b) };
  }, [avant, apres]);

  expect(vuParUnAutre.apres).toEqual(vuParUnAutre.avant);
});

test("la passion de PUBLICATION, elle, suit bien la bascule", async ({ page }) => {
  await boot(page);
  await enregistrerProfil(page, "Ben");

  await page.evaluate(() => { switchToProfile("pp_yoga"); });
  await page.waitForTimeout(300);

  // ⚠️ Contre-épreuve indispensable : figer l'avatar ne doit pas figer l'identité
  // d'écriture. Sans ce test, on pourrait « corriger » l'avatar en cassant la
  // bascule de passion, et les deux autres tests resteraient verts.
  const vu = await page.evaluate(async () => {
    await supaSavePassionState();
    return {
      actif: state.user.currentProfileId,
      // Ce dans quoi on PUBLIE : la passion active, qui a bien suivi.
      passionDEcriture: currentProfile() && currentProfile().passion,
      // Ce qui est PUBLIÉ comme passion principale du compte : la première
      // canonique, indépendante de la bascule.
      principalePubliee: (window.__rows.find(r => r.id === window.__uid) || {}).passion_id,
    };
  });

  expect(vu.actif).toBe("pp_yoga");
  expect(vu.passionDEcriture, "la passion d'écriture suit la bascule").toBe("yoga");
  // ⚠️ ET LES DEUX NE SONT PAS LA MÊME CHOSE — c'est tout ADR-010 en une ligne.
  // `profiles.passion_id` est la passion PRINCIPALE du compte (rétro-compat :
  // feed, embeds, anciens clients) ; elle ne bouge pas quand on change de
  // destination d'écriture. L'ancienne assertion se contentait de « non vide »,
  // ce qu'un `passion_id` qui SUIVRAIT la bascule satisferait aussi.
  expect(vu.principalePubliee, "la passion principale du compte ne suit PAS la bascule").toBe("moto");
});
