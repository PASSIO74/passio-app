// Helper partagé des tests E2E « in-app » (missions 2, 5, 6, 7).
// Entre dans l'app via un état local onboardé injecté dans localStorage —
// CI-safe (pas de compte Supabase créé) et rapide. Les fonctions de sync
// Supabase sont neutralisées après boot pour ne JAMAIS polluer la prod.
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

const PASSIONS = ["musique", "sport", "cuisine"];

// État d'un utilisateur onboardé avec `n` profils passion (1 par défaut).
function onboardedState(n = 1) {
  const profiles = [];
  for (let i = 0; i < n; i++) {
    profiles.push({
      id: "pp_" + i, name: "Audit QA", passion: PASSIONS[i % PASSIONS.length],
      emoji: "🎵", bio: "Profil de test " + i, color: "#7c3aed", createdAt: i + 1,
    });
  }
  return {
    onboarded: true, landingSeen: true, tourSeen: true,
    user: {
      name: "Audit QA", birthYear: 1995, isMinor: false,
      currentProfileId: "pp_0", profiles,
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
      following: [], savedCarnets: [], general: { username: "Audit QA" },
    },
    userPosts: [], userEvents: [], notifications: [],
    currentMood: "all", selectedFeedPassions: [],
  };
}

// Démarre l'app dans l'état onboardé. `errors` (optionnel) = { js:[], console:[], network:[] }.
// `opts.query` (optionnel) = chaîne ajoutée à l'URL. Depuis le déploiement validé
// du 2026-08-26, UI-1 + UI-2 sont actives sur l'URL normale ; les tests de
// secours posent explicitement le kill switch avant le boot.
// `opts.state` (optionnel) = état local COMPLET à injecter à la place de
// `onboardedState(nProfiles)`. Ajouté pour les cas qui ont besoin d'un compte
// précis (une passion du référentiel plat, par exemple) : le recopier dans le
// test ferait diverger deux fixtures, le passer ici n'en garde qu'une.
async function bootOnboarded(page, errors, nProfiles = 1, opts = {}) {
  if (errors) {
    page.on("pageerror", (e) => errors.js.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const txt = m.text();
      if (/Failed to load resource|net::|ERR_/.test(txt)) errors.network.push(txt);
      else errors.console.push(txt);
    });
  }
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    // Ne PAS écraser l'état s'il existe déjà : permet de tester la persistance
    // (un post créé puis un reload doit retrouver le post). addInitScript tourne
    // à chaque navigation, donc le garde est indispensable.
    if (!localStorage.getItem("passio_mvp_state_v1")) {
      localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    }
  }, [GATE_KEY, GATE_TOKEN, opts.state || onboardedState(nProfiles)]);
  await page.goto("/index.html" + (opts.query || ""));
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  await page.waitForTimeout(2500); // initApp (emoji-misc) + boot async
  // Fermer la landing (affichée sans session Supabase en test offline ; en prod
  // un utilisateur onboardé a une session anonyme persistante → pas de landing).
  // Et neutraliser les écritures Supabase pour garder la prod propre.
  await page.evaluate(() => {
    const l = document.getElementById("landing");
    if (l) l.classList.remove("active");
    // Conservées AVANT neutralisation : une suite qui doit exercer les VRAIS
    // chemins d'écriture le fait contre un client Supabase factice (cf.
    // partage-bobine.spec.js, commentaires-bobine.spec.js). Sans cette copie,
    // la fonction d'origine est définitivement perdue pour la page.
    window.__vraiSupa = {
      publishPost: window.supaPublishPostWithRetry,
      addComment: window.supaAddComment,
      insertNotif: window.supaInsertNotif,
      upsertProfile: window.supaUpsertProfile,
    };
    window.__vraiSupaPublishPost = window.supaPublishPostWithRetry;
    window.supaPublishPostWithRetry = async () => false;
    // ⚠️ supaSetPostLike doit répondre { ok:true } : un like dont l'écriture
    // serveur n'est pas confirmée est désormais ANNULÉ à l'écran.
    window.supaSetPostLike = async () => ({ ok: true, error: null });
    window.supaAddComment = () => {};
    window.supaInsertNotif = () => {};
    window.supaUpsertProfile = async () => {};
  });
}

// ══════════════════════════════════════════════════════════════════════════
// LE FIL SANS LES PUBLICATIONS DE PRODUCTION
// ──────────────────────────────────────────────────────────────────────────
// ⚠️ NEUTRALISER `window.supaLoadPosts` APRÈS LE BOOT ARRIVE TROP TARD, et c'est
// ce qui rendait `interactions` et `reel-deeplink` dépendantes de la production.
//
// `bootOnboarded` fait lui-même le `goto` : quand une suite pose son stub dans le
// `page.evaluate` qui suit, la requête du boot est DÉJÀ PARTIE. Le stub protège
// des chargements suivants, jamais du premier. En CI (avec réseau) ce premier
// chargement rapporte les vraies publications de `posts`.
//
// Conséquence mesurée le 2026-09-01 sur la PR #235 : `renderFeed` ne peint que
// `sortedPosts.slice(0, renderLimit)` avec `renderLimit = 20`, et le post semé
// par `seedServerPost` (`likes: 4`, auteur inconnu) DISPUTE SA PLACE aux vraies
// publications. Sonde lancée à l'identique sur `main` et sur une branche de
// feature, avec des publications simulées à `likes: 500+` :
//
//     34 posts → le post semé ranke 43e, non rendu   (les deux arbres)
//     60 posts → 69e, non rendu                       (les deux arbres)
//     publications à likes: 0 → rang 9, rendu         (les deux arbres)
//
// Le basculement dépend donc du CONTENU DE LA PRODUCTION, pas du code testé —
// d'où des échecs qui frappent des PR au hasard, sans rapport avec leur diff.
// Même maladie pour `reel-deeplink` : `buildReels` tronque à 30, et une bobine
// réelle pousse dehors la bobine de démonstration attendue.
//
// Le remède attaque la cause à la seule frontière que le code de l'application
// ne peut pas reprendre : le RÉSEAU, interdit avant même la navigation. Un stub
// posé sur `window` serait de toute façon écrasé par la déclaration
// `function supaLoadPosts` d'app-08 au chargement du script.
//
// ⚠️ Portée volontairement étroite. Seules les LECTURES de la table `posts` sont
// court-circuitées : les écritures (POST) passent, pour qu'une suite qui exerce
// un vrai chemin de publication continue de le faire. Et `post_likes` /
// `post_comments` ne matchent pas — le motif exige `posts?`.
//
// ⚠️ Sans réseau (conteneur de dev sans accès à Supabase), cette route ne se
// déclenche jamais : le comportement local est INCHANGÉ. Le correctif ne peut
// donc rien casser là où il ne sert à rien — mais il ne peut pas non plus y être
// vérifié. C'est la CI qui en fait foi.
async function sansPublicationsDistantes(page) {
  await page.route(/\/rest\/v1\/posts\?/, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

module.exports = { onboardedState, bootOnboarded, sansPublicationsDistantes, PASSIONS };
