// « Partager mon expérience » depuis une activité — la passion ne doit JAMAIS
// se vider en silence.
//
// ── Le défaut, mesuré le 2026-08-29 ──────────────────────────────────────────
// `shareEventExperience` préremplissait le Studio puis forçait la passion de
// l'activité dans `#postPassion` :
//
//     if (sel && ev.passion) { try { sel.value = ev.passion; } catch (e) {} }
//
// Or `#postPassion` ne contient QUE les passions des profils de l'utilisateur
// (`renderStudio`). Affecter `select.value` avec une valeur qui n'a AUCUNE
// `<option>` correspondante **ne lève pas** : le select passe silencieusement à
// la chaîne vide. Le `try/catch` ne pouvait donc rien attraper.
//
// Conséquences, toutes silencieuses :
//   ① le post partait avec `passion: ""` ;
//   ② le fil est filtré PAR DÉFAUT sur les passions des profils
//      (`migrerInteretsDepuisProfils`, app-02) — le souvenir était donc
//      **invisible dans le fil de son propre auteur** ;
//   ③ la ligne partait en base sans provenance de passion.
//
// Ce défaut rendait `ui-v7-parcours.spec.js` ⑦ flaky SANS QUE PERSONNE NE LE
// SACHE : ce test partage la PREMIÈRE activité que `_filterIrlEvents` retourne,
// et cette activité change avec l'heure. Quand elle portait la passion de
// l'utilisateur, le select l'acceptait et le test passait ; sinon il tombait.
// Vert la nuit, rouge le matin — et attribué au dernier commit venu.
//
// ── Ce que cette suite prouve ───────────────────────────────────────────────
// Les deux cas, dans les deux sens : la passion de l'activité est reprise quand
// l'utilisateur la possède, et la passion ACTIVE est conservée quand il ne la
// possède pas. Un correctif qui se contenterait de ne plus rien forcer passerait
// le second test et échouerait le premier.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Une activité fabriquée sur mesure : c'est sa passion qui est la variable
// d'expérience, on ne la laisse pas au hasard du contenu de démonstration.
async function poserActivite(page, passion) {
  return await page.evaluate((pass) => {
    const ev = {
      id: "ev_partage_" + pass,
      title: "Atelier de test",
      passion: pass,
      city: "Annecy",
      date: Date.now() + 3 * 86400000,
      attendees: [],
      organizerId: "u_autre",
    };
    state.seed.events = state.seed.events || [];
    state.seed.events.push(ev);
    return ev.id;
  }, passion);
}

async function partagerPuisLire(page, evid) {
  await page.evaluate((id) => shareEventExperience(id), evid);
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-studio");
    return el && el.classList.contains("active");
  }, null, { timeout: 8000 });
  // `shareEventExperience` force la valeur à +250 ms : on attend au-delà.
  await page.waitForTimeout(700);
  return await page.evaluate(() => ({
    valeur: document.getElementById("postPassion").value,
    options: [...document.getElementById("postPassion").options].map((o) => o.value),
  }));
}

test.describe("partage d'expérience — la passion ne se vide jamais", () => {
  test("passion possédée : elle est bien reprise depuis l'activité", async ({ page }) => {
    // Trois profils : musique, sport, cuisine (cf. app-helper).
    await bootOnboarded(page, null, 3);
    const evid = await poserActivite(page, "sport");
    const r = await partagerPuisLire(page, evid);

    expect(r.options, "le Studio propose bien cette passion").toContain("sport");
    expect(r.valeur).toBe("sport");
  });

  test("passion NON possédée : le champ garde l'identité active au lieu de se vider", async ({ page }) => {
    // Un seul profil (musique) : « jardinage » n'a aucune <option>.
    await bootOnboarded(page, null, 1);
    const evid = await poserActivite(page, "jardinage");
    const r = await partagerPuisLire(page, evid);

    expect(r.options, "le cas de test n'a de sens que si l'option est absente")
      .not.toContain("jardinage");
    // ⚠️ L'assertion qui compte. Sans le correctif : "".
    expect(r.valeur, "le select ne doit pas être vidé en silence").not.toBe("");
    expect(r.options).toContain(r.valeur);
  });

  test("le souvenir publié reste visible dans le fil de son auteur", async ({ page }) => {
    await bootOnboarded(page, null, 1);
    const evid = await poserActivite(page, "jardinage");
    await partagerPuisLire(page, evid);

    await page.fill("#postText", "Super moment, on remet ça.");
    await page.locator("[data-v6-publier]").click();
    await page.waitForFunction(() => (state.userPosts || []).length === 1, null, { timeout: 10000 });

    // La preuve du défaut ② : le fil est filtré par défaut sur les passions des
    // profils, un post sans passion n'y entre donc jamais.
    const etat = await page.evaluate(() => ({
      passionDuPost: (state.userPosts[0] || {}).passion,
      filtreDuFil: (typeof _activeFeedPassions !== "undefined") ? [..._activeFeedPassions] : [],
    }));
    expect(etat.passionDuPost, "le post publié porte une passion").not.toBe("");
    expect(etat.filtreDuFil).toContain(etat.passionDuPost);

    await page.evaluate(() => goTo("feed"));
    await expect(page.locator('#feedList .post:has-text("on remet ça")')).toHaveCount(1, { timeout: 8000 });
  });
});
