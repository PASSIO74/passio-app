// ADR-010 — le parcours d'abonnement, du GESTE au résultat durable.
//
// `feed-vues-adr010.spec.js` prouve le CONTRAT du fil, mais il pose
// `state.user.following` à la main. Cette suite-ci exerce le geste réel —
// `toggleFollowUser`, celui que le bouton « ➕ Suivre » appelle — et suit la
// chaîne entière : suivre → la publication apparaît dans Accueil → RECHARGEMENT
// COMPLET → elle est toujours là → se désabonner → elle disparaît.
//
// C'était l'enjeu d'ADR-010 : avant, l'effet de « Suivre » dépendait d'une
// bascule non persistée, donc suivre quelqu'un n'avait aucun effet durable.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// L'auteur suivi publie dans une passion que je n'ai PAS choisie : sa présence
// dans mon fil ne peut alors venir que de l'abonnement.
//
// ⚠️ PIÈGE PAYÉ EN ÉCRIVANT CETTE SUITE. Une première version ne posait QUE la
// publication de Sacha. Accueil se retrouvait vide — ma passion choisie n'ayant
// aucun contenu et ne suivant personne — et le **repli d'exploration** («  Rien
// encore dans Musique […] voici ce qui vit ailleurs sur PASSIO ») affichait le
// post de Sacha, correctement étiqueté « Hors de tes passions ». La prémisse
// « au départ, on ne le voit pas » était donc FAUSSE, et le test rouge disait
// vrai. On pose maintenant un contenu dans la passion choisie : Accueil n'est
// jamais vide, le repli ne se déclenche pas, et la présence de Sacha ne peut
// venir que de l'abonnement — ce que la suite prétend mesurer.
async function poser(page) {
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaUpsertProfile = async () => {};
    window.supaFollowUser = async () => ({ error: null });
    window.supaUnfollowUser = async () => ({ error: null });

    state.seed.users = (state.seed.users || []).filter((u) => u.id !== "u_sacha");
    state.seed.users.push({ id: "u_sacha", name: "Sacha", profileEmoji: "🍳", avatar: "#8b5cf6", passion: "cuisine" });
    state.seed.users = state.seed.users.filter((u) => u.id !== "u_tiers");
    state.seed.users.push({ id: "u_tiers", name: "Alex", profileEmoji: "🎸", avatar: "#8b5cf6", passion: "musique" });
    state.seed.posts = [
      {
        id: "p_sacha", authorId: "u_sacha", userId: "u_sacha", passion: "cuisine",
        type: "text", text: "POST_DE_SACHA", mood: "all",
        createdAt: Date.now() - 1000, likes: 0, comments: [],
      },
      // Contenu de MA passion choisie, d'un auteur que je ne suis pas : il garde
      // Accueil non vide, donc hors du repli d'exploration (cf. la note ci-dessus).
      {
        id: "p_musique", authorId: "u_tiers", userId: "u_tiers", passion: "musique",
        type: "text", text: "POST_DE_MA_PASSION", mood: "all",
        createdAt: Date.now() - 2000, likes: 0, comments: [],
      },
    ];
    state.supabasePosts = [];
    state.userPosts = [];
    state.user.following = [];
    state.user.profiles = [{ id: "pp_0", name: "Audit QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    state.user.currentProfileId = "pp_0";
    setFeedPassions(["musique"]);          // « cuisine » n'est PAS choisie
    state.feedView = "accueil";
    selectedMoods = new Set(["all", "creation", "learn", "chill", "actu"]);
    state.feedMoodsTouched = true;
    saveState();
    window._feedDomSig = null;
    goTo("feed");
    renderFeed();
  });
  await page.waitForTimeout(400);
}

const texte = (page) => page.evaluate(() => document.getElementById("feedList").innerText);

test("le parcours complet : suivre → voir → recharger → toujours voir → se désabonner → ne plus voir", async ({ page }) => {
  await bootOnboarded(page, null, 1, {});
  await poser(page);

  // ── ① Avant de suivre : rien. C'est la prémisse, et elle est vérifiée —
  //     sans elle, un test qui « voit » le post ne prouverait rien.
  const depart = await texte(page);
  expect(depart, "le fil n'est PAS vide : le repli d'exploration ne se déclenche pas")
    .toContain("POST_DE_MA_PASSION");
  expect(depart, "et il ne montre donc rien « d'ailleurs »").not.toContain("EXPLORATION");
  expect(depart, "au départ, Sacha n'est pas suivi").not.toContain("POST_DE_SACHA");

  // ── ② Le GESTE réel. `toggleFollowUser` exige le bouton que la fiche de
  //     profil rend : on le pose tel quel, avec l'id qu'elle lui donne.
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "followBtn_u_sacha";
    document.body.appendChild(b);
    toggleFollowUser("u_sacha", "Sacha");
  });
  await page.waitForTimeout(200);

  const apres = await page.evaluate(() => {
    const b = document.getElementById("followBtn_u_sacha");
    // ⚠️ `toggleFollowUser` ne rappelle PAS `renderFeed` (contrairement à
    // `blockUser`). Le fil se repeint en revenant dessus — c'est le parcours
    // réel : on suit depuis la fiche de quelqu'un, puis on revient au fil.
    goTo("feed");
    renderFeed();
    return { bouton: b.innerHTML, suivis: state.user.following.slice() };
  });
  await page.waitForTimeout(300);

  expect(apres.suivis).toContain("u_sacha");
  expect(apres.bouton).toContain("Suivi");
  expect(await texte(page), "suivre fait entrer sa publication dans Accueil").toContain("POST_DE_SACHA");

  // ── ③ RECHARGEMENT COMPLET. Le point qui compte : l'abonnement doit vivre
  //     dans l'état persisté, pas dans une bascule de session.
  await page.reload();
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500);

  const survivant = await page.evaluate(() => {
    const l = document.getElementById("landing");
    if (l) l.classList.remove("active");
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    // Le seed est reconstruit au boot : on repose la publication de Sacha, mais
    // PAS l'abonnement — c'est lui qu'on met à l'épreuve.
    state.seed.users = (state.seed.users || []).filter((u) => u.id !== "u_sacha");
    state.seed.users.push({ id: "u_sacha", name: "Sacha", profileEmoji: "🍳", avatar: "#8b5cf6", passion: "cuisine" });
    state.seed.users = state.seed.users.filter((u) => u.id !== "u_tiers");
    state.seed.users.push({ id: "u_tiers", name: "Alex", profileEmoji: "🎸", avatar: "#8b5cf6", passion: "musique" });
    state.seed.posts = [
      {
        id: "p_sacha", authorId: "u_sacha", userId: "u_sacha", passion: "cuisine",
        type: "text", text: "POST_DE_SACHA", mood: "all",
        createdAt: Date.now() - 1000, likes: 0, comments: [],
      },
      {
        id: "p_musique", authorId: "u_tiers", userId: "u_tiers", passion: "musique",
        type: "text", text: "POST_DE_MA_PASSION", mood: "all",
        createdAt: Date.now() - 2000, likes: 0, comments: [],
      },
    ];
    state.supabasePosts = [];
    selectedMoods = new Set(["all", "creation", "learn", "chill", "actu"]);
    state.feedMoodsTouched = true;
    window._feedDomSig = null;
    goTo("feed");
    renderFeed();
    return { suivis: (state.user.following || []).slice(), vue: feedViewCourante(), passions: [...(_activeFeedPassions || [])] };
  });
  await page.waitForTimeout(400);

  expect(survivant.suivis, "l'abonnement a survécu au rechargement").toContain("u_sacha");
  expect(survivant.vue, "et la vue aussi").toBe("accueil");
  expect(survivant.passions, "« cuisine » n'a jamais été ajoutée aux passions choisies").not.toContain("cuisine");
  expect(await texte(page), "après rechargement, sa publication est toujours là").toContain("POST_DE_SACHA");

  // ── ④ Se désabonner, par le même geste, retire la source.
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "followBtn_u_sacha";
    document.body.appendChild(b);
    toggleFollowUser("u_sacha", "Sacha");
    window._feedDomSig = null;
    renderFeed();
  });
  await page.waitForTimeout(300);

  const fin = await page.evaluate(() => ({ suivis: (state.user.following || []).slice() }));
  expect(fin.suivis).not.toContain("u_sacha");
  const fini = await texte(page);
  expect(fini, "se désabonner retire sa publication d'Accueil").not.toContain("POST_DE_SACHA");
  // ⚠️ Et le fil n'est pas simplement retombé dans le repli d'exploration, qui
  // masquerait un désabonnement sans effet derrière un écran d'apparence vide.
  expect(fini, "ma passion choisie est toujours servie").toContain("POST_DE_MA_PASSION");
  expect(fini).not.toContain("EXPLORATION");
});

test("suivre n'ajoute JAMAIS la passion de l'autre à mes préférences de lecture", async ({ page }) => {
  // Les deux états sont distincts par décision (ADR-010) : un abonnement est un
  // lien vers une PERSONNE, pas un abonnement à une passion. Les confondre
  // remplirait le fil de contenus jamais demandés — et rendrait le désabonnement
  // partiellement sans effet, la passion restant choisie.
  await bootOnboarded(page, null, 1, {});
  await poser(page);

  const vu = await page.evaluate(() => {
    const avant = [...(_activeFeedPassions || [])];
    const b = document.createElement("button");
    b.id = "followBtn_u_sacha";
    document.body.appendChild(b);
    toggleFollowUser("u_sacha", "Sacha");
    return { avant, apres: [...(_activeFeedPassions || [])], ecriture: currentProfile().passion };
  });

  expect(vu.apres).toEqual(vu.avant);
  expect(vu.apres).not.toContain("cuisine");
  // Et la passion d'ÉCRITURE ne bouge pas davantage.
  expect(vu.ecriture).toBe("musique");
});
