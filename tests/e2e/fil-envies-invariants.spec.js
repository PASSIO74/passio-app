// ══════════════════════════════════════════════════════════════════════════
// LE FIL CONTRE UN ORACLE INDÉPENDANT — toutes les combinaisons (2026-11-14)
// ──────────────────────────────────────────────────────────────────────────
// Demande de Benjamin : « contrôle tous ces algorithmes d'affichage des mood et
// des passions qu'il n'y ait pas d'erreur ». Cette suite ne relit pas le code :
// elle recalcule, À PART, ce que le fil DOIT montrer, et le compare à ce qu'il
// PEINT, pour « Suivis » coché/décoché × les 16 sous-ensembles d'envies.
//
//   SOURCES (OU) : auteur suivi (si « Suivis » coché)  OU  passion cochée
//   FILTRE  (ET) : au moins une envie cochée satisfaite (aucune = pas de filtre)
//     · Apprendre  ⇐ mood "learn"     · Idées ⇐ mood "creation"
//     · Rencontrer ⇐ mood "irl"       · Explorer ⇐ auteur non suivi OU passion
//       non cochée — et JAMAIS une de MES publications : ce que j'ai publié
//       n'est pas une découverte (défaut vu sur la capture du 2026-11-14 :
//       « Rénovation marquise », publiée par le lecteur, en tête d'Explorer).
//   ORDRE : le réel d'abord, puis les exemples, chacun en chronologique ;
//           aucune carte en double.
// ══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const ENVIES = ["discover", "learn", "create", "meet"];
const MOOD_ENVIE = { learn: "learn", creation: "create", irl: "meet" };

async function semer(page) {
  await bootOnboarded(page, null, 1, {});
  return page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaSaveUserState = async () => {};
    window.supaSavePassionState = async () => {};
    window.supaUpsertProfile = async () => {};
    const t = Date.now();
    const moi = MY_UID;
    const P = (id, authorId, passion, mood, age) => ({
      id, authorId, passion, mood, type: "text", text: "T_" + id,
      createdAt: t - age * 1000, likes: 0, comments: [],
    });
    state.seed.users = (state.seed.users || []).filter((u) => !/^u_(ami|inco)/.test(u.id));
    state.seed.users.push({ id: "u_ami", name: "Ami", passion: "photo" },
                          { id: "u_inco", name: "Inconnu", passion: "yoga" });
    state.seed.posts = [
      P("s_ami_photo_learn", "u_ami", "photo", "learn", 1),
      P("s_ami_yoga_all", "u_ami", "yoga", "all", 2),
      P("s_ami_photo_irl", "u_ami", "photo", "irl", 3),
      P("s_ami_sans_passion", "u_ami", null, "creation", 4),
      P("s_inco_yoga_learn", "u_inco", "yoga", "learn", 5),
      P("s_inco_yoga_crea", "u_inco", "yoga", "creation", 6),
      P("s_inco_yoga_irl", "u_inco", "yoga", "irl", 7),
      P("s_inco_yoga_all", "u_inco", "yoga", "all", 8),
      P("s_inco_yoga_chill", "u_inco", "yoga", "chill", 9),
      P("s_inco_voyage_actu", "u_inco", "voyage", "actu", 10),
      P("s_inco_cuisine_learn", "u_inco", "cuisine", "learn", 11), // hors de toute source
      Object.assign(P("s_inco_yoga_bobine", "u_inco", "yoga", "learn", 12), { isReel: true }),
    ];
    state.supabasePosts = [];
    window._feedExtraPosts = [];
    // MES publications : une dans ma passion, une partagée depuis l'IRL.
    state.userPosts = [
      P("m_yoga_crea", moi, "yoga", "creation", 13),
      P("m_voyage_irl", moi, "voyage", "irl", 14),
    ];
    state.user.profiles = [
      { id: "pp_yoga", name: "Moi", passion: "yoga", emoji: "🧘", color: "#7c3aed", createdAt: 1 },
      { id: "pp_voy", name: "Moi", passion: "voyage", emoji: "✈️", color: "#7c3aed", createdAt: 2 },
    ];
    state.user.currentProfileId = "pp_yoga";
    state.user.following = ["u_ami"];
    setFeedPassions(["yoga", "voyage"]);
    return { moi, posts: state.seed.posts.map((p) => Object.assign({ _exemple: true }, p)).concat(state.userPosts) };
  });
}

function oracle(posts, moi, suivis, envies) {
  const passions = new Set(["yoga", "voyage"]);
  const suit = new Set(["u_ami"]);
  return posts
    .filter((p) => !p.isReel)
    .filter((p) => passions.has(p.passion) || (suivis && suit.has(p.authorId)))
    .filter((p) => {
      if (!envies.length) return true;
      return envies.some((e) => {
        if (e === "discover") {
          if (p.authorId === moi) return false;
          // Une publication SANS passion ne dit rien de neuf par sa passion :
          // seul un auteur non suivi en fait une découverte.
          return !suit.has(p.authorId) || (!!p.passion && !passions.has(p.passion));
        }
        return MOOD_ENVIE[p.mood] === e;
      });
    })
    // `ordonnerFil` : le RÉEL d'abord (mes publications), puis les exemples,
    // chacun des deux groupes en chronologique.
    .sort((a, b) => (a._exemple ? 1 : 0) - (b._exemple ? 1 : 0) || b.createdAt - a.createdAt)
    .map((p) => p.id);
}

test("le fil peint exactement l'oracle, pour 32 combinaisons sources × envies", async ({ page }) => {
  const { moi, posts } = await semer(page);
  const ecarts = [];
  for (const suivis of [true, false]) {
    for (let masque = 0; masque < 16; masque++) {
      const envies = ENVIES.filter((_, i) => masque & (1 << i));
      const peint = await page.evaluate(({ suivis, envies }) => {
        state.feedFollowingOn = suivis;
        setFeedIntents(envies);
        window._feedRenderLimit = 100;
        window._feedDomSig = null;
        renderFeed();
        return Array.from(document.querySelectorAll("#feedList .post[data-postid]"))
          .map((el) => el.getAttribute("data-postid"));
      }, { suivis, envies });
      const attendu = oracle(posts, moi, suivis, envies);
      if (JSON.stringify(peint) !== JSON.stringify(attendu)) {
        ecarts.push({ suivis, envies: envies.join("+") || "(aucune)", peint, attendu });
      }
    }
  }
  expect(ecarts, JSON.stringify(ecarts, null, 1)).toEqual([]);
});

test("« Explorer » n'est jamais satisfait par MA publication", async ({ page }) => {
  await semer(page);
  const r = await page.evaluate(() => ({
    mienne: feedPostMatchesIntent(state.userPosts[0], "discover"),
    autre: feedPostMatchesIntent(state.seed.posts.find((p) => p.id === "s_inco_yoga_learn"), "discover"),
  }));
  expect(r.mienne).toBe(false);
  expect(r.autre).toBe(true);
});
