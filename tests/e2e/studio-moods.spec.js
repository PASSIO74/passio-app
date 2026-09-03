// Suite « Moods du Studio » — alignement du vocabulaire de publication sur le
// rail d'intentions du Fil (Explorer · Apprendre · Idées · Rencontrer).
//
// Ce que la suite protège, dans l'ordre où ça s'est cassé pendant l'écriture :
//
//   ① Les LIBELLÉS changent, les VALEURS non. `creation`, `learn`, `irl` sont
//      écrites en base (`posts.mood`) et relues par `legacyMoodToFeedIntent` :
//      un renommage de valeur ferait perdre son classement à toute publication
//      existante. La suite vérifie donc le couple (libellé vu, valeur publiée).
//
//   ② « Rencontrer » (`irl`) n'était choisissable NULLE PART avant ce lot :
//      `legacyMoodToFeedIntent` savait le traduire en `meet` et `moodTagLabel`
//      savait l'afficher, mais aucune pastille ne le produisait. Le bonus
//      d'intention « Rencontrer » était donc structurellement inatteignable.
//
//   ③ Pas de pastille « Explorer ». Cette intention se calcule côté LECTEUR
//      (auteur non suivi, passion inconnue) et ne regarde jamais le mood : une
//      pastille y serait décorative, donc mensongère.
//
//   ④ Le mood « creation » reste le défaut, parce que `publishPost` n'appelle
//      `bumpQuest("publish")` que sur cette valeur — changer le défaut arrêtait
//      la quête quotidienne en silence.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Rangée de pastilles attendue : libellé visible → valeur publiée.
const PASTILLES = [
  { label: "💡 Idées", value: "creation" },
  { label: "📚 Apprendre", value: "learn" },
  { label: "🤝 Rencontrer", value: "irl" },
  { label: "✨ Tous", value: "all" },
];

async function ouvrirStudio(page) {
  await page.evaluate(() => goTo("studio"));
  await expect(page.locator("#screen-studio")).toHaveClass(/active/);
  // Sous UI-6 le champ vit dans le repli « Options » : l'ouvrir sinon les
  // pastilles sont dans le DOM mais pas cliquables.
  await page.evaluate(() => {
    const d = document.querySelector(".v6-affiner");
    if (d) d.open = true;
  });
}

test.describe("Studio — moods alignés sur les intentions du Fil", () => {
  test("la rangée porte les quatre nouvelles pastilles, dans l'ordre", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirStudio(page);

    const pills = page.locator("#postMoodRow .pill");
    await expect(pills).toHaveCount(PASTILLES.length);
    expect((await pills.allTextContents()).map((t) => t.trim()))
      .toEqual(PASTILLES.map((p) => p.label));
    expect(await pills.evaluateAll((els) => els.map((el) => el.dataset.postmood)))
      .toEqual(PASTILLES.map((p) => p.value));
  });

  test("les anciens moods « chill » et « actu » ne sont plus proposés", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirStudio(page);

    await expect(page.locator('#postMoodRow .pill[data-postmood="chill"]')).toHaveCount(0);
    await expect(page.locator('#postMoodRow .pill[data-postmood="actu"]')).toHaveCount(0);
  });

  test("aucune pastille « Explorer » : l'intention ne lit pas le mood", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirStudio(page);

    const labels = (await page.locator("#postMoodRow .pill").allTextContents()).join(" ");
    expect(labels).not.toContain("Explorer");
    // Le rail de lecture, lui, l'expose bien : les deux surfaces sont
    // volontairement différentes, ce n'est pas un oubli.
    await expect(page.locator('.feed-intent-btn[data-intent="discover"]')).toHaveCount(1);
  });

  test("le défaut reste « creation » — sinon bumpQuest(\"publish\") s'arrête", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirStudio(page);

    await expect(page.locator("#postMoodRow .pill.active")).toHaveCount(1);
    await expect(page.locator("#postMoodRow .pill.active")).toHaveAttribute("data-postmood", "creation");
  });

  test("« Rencontrer » publie bien la valeur irl, que le Fil traduit en meet", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirStudio(page);

    await page.locator('#postMoodRow .pill[data-postmood="irl"]').click();
    await expect(page.locator('#postMoodRow .pill[data-postmood="irl"]')).toHaveClass(/active/);
    await expect(page.locator("#postMoodRow .pill.active")).toHaveCount(1);

    await page.fill("#postText", "On se retrouve au studio de répétition");
    await page.evaluate(() => publishPost());
    await page.waitForFunction(() => (state.userPosts || []).length > 0, null, { timeout: 15000 });

    const publie = await page.evaluate(() => {
      const p = state.userPosts[0];
      return { mood: p.mood, intent: legacyMoodToFeedIntent(p.mood), tag: moodTagLabel(p.mood) };
    });
    expect(publie.mood).toBe("irl");
    expect(publie.intent).toBe("meet");
    expect(publie.tag).toBe("🤝 Rencontrer");
  });

  test("« Tous » publie le neutre, qui ne porte aucune étiquette", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirStudio(page);

    await page.locator('#postMoodRow .pill[data-postmood="all"]').click();
    await page.fill("#postText", "Publication sans intention particulière");
    await page.evaluate(() => publishPost());
    await page.waitForFunction(() => (state.userPosts || []).length > 0, null, { timeout: 15000 });

    const publie = await page.evaluate(() => {
      const p = state.userPosts[0];
      return { mood: p.mood, intent: legacyMoodToFeedIntent(p.mood), tag: moodTagLabel(p.mood) };
    });
    expect(publie.mood).toBe("all");
    expect(publie.intent).toBe("generic");
    expect(publie.tag).toBe("");
  });

  test("un brouillon portant un mood retiré revient sur le neutre, pas sur une rangée muette", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    await ouvrirStudio(page);

    const etat = await page.evaluate(() => {
      state.user.drafts = [{ id: "d_legacy", type: "text", mood: "chill", text: "Ancien brouillon" }];
      loadDraft("d_legacy");
      return {
        mood: studioMood,
        actives: Array.from(document.querySelectorAll("#postMoodRow .pill.active"))
          .map((el) => el.dataset.postmood),
      };
    });
    expect(etat.mood).toBe("all");
    expect(etat.actives).toEqual(["all"]);
  });

  test("la table de libellés est unique : fil et bobines disent le même mot", async ({ page }) => {
    await bootOnboarded(page, null, 1);

    const dits = await page.evaluate(() =>
      ["creation", "learn", "irl", "chill", "actu", "all", "valeur_inconnue"].map((m) => ({
        m, tag: moodTagLabel(m), court: moodShortLabel(m),
      })));

    expect(dits).toEqual([
      { m: "creation", tag: "💡 Idées", court: "Idées" },
      { m: "learn", tag: "📚 Apprendre", court: "Apprendre" },
      // Les bobines ignoraient « irl » (« Tout ») : le trou est fermé par la
      // même table qui sert au fil.
      { m: "irl", tag: "🤝 Rencontrer", court: "Rencontrer" },
      // ⚠️ ASSERTION RETOURNÉE LE 2026-09-02, ET C'EST LE POINT DU LOT.
      // « chill » et « actu » n'étaient déjà plus publiables (test ② de ce
      // fichier) ; ils gardaient pourtant un libellé, donc une pastille sur la
      // carte. Le produit n'a plus que quatre intentions — Explorer · Apprendre
      // · Idées · Rencontrer — et deux d'entre elles nommaient des mots que
      // l'utilisateur ne pouvait plus choisir nulle part. Ils rendent désormais
      // exactement ce que rend le neutre.
      { m: "chill", tag: "", court: "Tout" },
      { m: "actu", tag: "", court: "Tout" },
      { m: "all", tag: "", court: "Tout" },
      { m: "valeur_inconnue", tag: "", court: "Tout" },
    ]);
  });

  // ⚠️ LE PENDANT INDISPENSABLE DE L'ASSERTION CI-DESSUS. Retirer un libellé ne
  // doit pas retirer la VALEUR : la base de production porte des milliers de
  // publications en « chill » / « actu », et la liste blanche qui décide de leur
  // entrée dans le fil lisait justement la table des libellés. Les deux usages
  // ont été scindés (`PASSIO_MOODS_ADMIS`) — sans quoi ce lot de vocabulaire
  // aurait effacé du contenu réel.
  test("perdre son libellé ne fait pas perdre son droit d'exister", async ({ page }) => {
    await bootOnboarded(page, null, 1);

    const admis = await page.evaluate(() => ({
      libelles: Object.keys(PASSIO_MOOD_LABELS).sort(),
      admis: Object.keys(PASSIO_MOODS_ADMIS).sort(),
    }));

    expect(admis.libelles, "seules les trois envies vivantes portent un mot")
      .toEqual(["creation", "irl", "learn"]);
    expect(admis.admis, "les valeurs léguées restent admises, sans être nommées")
      .toEqual(["actu", "chill", "creation", "irl", "learn"]);
  });
});
