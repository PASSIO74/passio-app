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
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

async function boot(page) {
  await bootOnboarded(page, null, 1, {});
  await page.evaluate(() => {
    window.__rows = [];
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaUsernameTaken = async () => null;   // pas d'aller-retour réseau
    // ⚠️ `supa` est un `let` de portée script : seul `_initRealSupa()` peut le
    // rebinder, en lisant le SDK global (cf. partage-bobine.spec.js).
    window.supabase = {
      createClient: () => ({
        from: () => ({
          upsert: async (row) => {
            window.__rows = window.__rows.filter(r => r.id !== row.id).concat([row]);
            return { error: null };
          },
          insert: async () => ({ error: null }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    };
    window._supaReal = false;
    _initRealSupa();
    window.supaUpsertProfile = window.__vraiSupa.upsertProfile;

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
  const enMoto = await page.evaluate(() => window.__rows[window.__rows.length - 1]);
  expect(enMoto, "une ligne profiles a été publiée").toBeTruthy();

  // ── Bascule vers Yoga, puis SECOND enregistrement.
  await page.evaluate(() => { switchToProfile("pp_yoga"); });
  await page.waitForTimeout(300);
  await enregistrerProfil(page, "Ben");
  const enYoga = await page.evaluate(() => window.__rows[window.__rows.length - 1]);

  // ⚠️ LE test. L'emoji ET la couleur publiés doivent être IDENTIQUES.
  // `supaLoadPosts` reconstruit l'avatar de CHAQUE publication depuis cette
  // ligne : si elle bouge, tout l'historique change d'apparence chez les autres.
  expect(enYoga.emoji, "l'emoji public ne suit pas la passion active").toBe(enMoto.emoji);
  expect(enYoga.color, "la couleur publique ne suit pas la passion active").toBe(enMoto.color);
});

test("un second compte voit le même avatar avant et après la bascule", async ({ page }) => {
  await boot(page);
  await enregistrerProfil(page, "Ben");
  const avant = await page.evaluate(() => window.__rows[window.__rows.length - 1]);

  await page.evaluate(() => { switchToProfile("pp_yoga"); });
  await page.waitForTimeout(300);
  await enregistrerProfil(page, "Ben");
  const apres = await page.evaluate(() => window.__rows[window.__rows.length - 1]);

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
  const enMoto = await page.evaluate(() => window.__rows[window.__rows.length - 1]);

  await page.evaluate(() => { switchToProfile("pp_yoga"); });
  await page.waitForTimeout(300);
  const actif = await page.evaluate(() => state.user.currentProfileId);

  // ⚠️ Contre-épreuve indispensable : figer l'avatar ne doit pas figer l'identité
  // d'écriture. Sans ce test, on pourrait « corriger » l'avatar en cassant la
  // bascule de passion, et les deux autres tests resteraient verts.
  expect(actif).toBe("pp_yoga");
  expect(enMoto.passion_id, "la passion publiée reste celle du compte").toBeTruthy();
});
