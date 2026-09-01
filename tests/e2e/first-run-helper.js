// Helper de la suite « première visite » (drapeau `first_run_experience_v1`).
//
// ⚠️ IL N'INJECTE AUCUN ÉTAT LOCAL, contrairement à `app-helper.js`. Tout
// l'intérêt de ce lot est justement le démarrage d'un appareil VIERGE :
// `localStorage` vide, aucune session Supabase, `state.onboarded` à false.
// Poser un état onboardé ferait sortir `entreeDirecte()` par sa garde
// « compte existant » et le test mesurerait le parcours historique.
//
// ⚠️ LE SDK SUPABASE EST COUPÉ, ET ON LE PROUVE. `index.html` charge le SDK
// depuis un CDN : avec réseau sortant, `_initRealSupa()` construit un VRAI
// client et le fil invité lirait la base de production — le test mesurerait
// alors la prod, pas le programme (leçon ADR-010, « un test qui ne contrôle pas
// sa prémisse mesure autre chose »). On coupe la route ET on vérifie
// `window._supaReal === false` avant chaque cas.
const { GATE_TOKEN, GATE_KEY } = require("./gate-helper");

// Toute requête vers le CDN du SDK et vers l'API Supabase est refusée : aucune
// écriture ne peut donc atteindre la production, quoi que fasse le code.
async function couperReseauSupabase(page, journal) {
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (/supabase|jsdelivr|unpkg|cdnjs/i.test(url)) {
      if (journal) journal.push(route.request().method() + " " + url);
      return route.abort();
    }
    return route.continue();
  });
}

// Démarre l'application en VISITEUR : gate déverrouillé, rien d'autre.
// `opts.flag` : "on" (défaut) | "off".
// ⚠️ LES DEUX SENS ONT ÉTÉ INVERSÉS LE 2026-09-01, quand le lot est passé actif
// par défaut. "on" n'écrit désormais RIEN — c'est tout l'intérêt : le test
// mesure le VRAI défaut de production, pas un drapeau que le helper aurait posé
// lui-même. "off" pose explicitement la coupure `"0"`, alors qu'il se contentait
// avant de nettoyer la clé. Un helper qui aurait gardé l'ancien "off" (nettoyer)
// serait devenu un synonyme silencieux de "on".
// `opts.prefs` : préférences d'invité pré-existantes (retour de visite).
// `opts.hash`  : lien profond à ouvrir.
// `opts.sansBienvenue` : ferme la carte de bienvenue AVANT le boot, pour libérer
//   la place quand le test porte sur autre chose (le tour, par exemple).
async function bootVisiteur(page, opts = {}) {
  const flagOn = opts.flag !== "off";
  const journalReseau = [];
  await couperReseauSupabase(page, journalReseau);
  await page.addInitScript(
    ([k, t, on, prefs, sansBienvenue]) => {
      sessionStorage.setItem(k, t);
      sessionStorage.setItem("passio_pwa_dismissed", "1");
      // ⚠️ `addInitScript` tourne à CHAQUE navigation, rechargement compris.
      // "on" n'écrit RIEN : le parcours est actif par défaut, et poser une
      // valeur positive masquerait justement une régression du défaut.
      // On nettoie quand même un éventuel "1" laissé par un ancien aperçu, une
      // seule fois, pour qu'aucun cas ne s'appuie dessus sans le dire.
      if (on) {
        if (!sessionStorage.getItem("__fr_drapeau_nettoye")) {
          localStorage.removeItem("passio_first_run_experience_v1");
          sessionStorage.setItem("__fr_drapeau_nettoye", "1");
        }
      } else {
        localStorage.setItem("passio_first_run_experience_v1", "0");
      }
      if (prefs) localStorage.setItem("passio_first_run_v1", JSON.stringify(prefs));
      // ⚠️ La fermeture de la carte de bienvenue vit dans `sessionStorage`, PAS
      // dans les préférences : tant qu'aucun compte n'existe, elle revient à
      // chaque visite. Un test qui veut la place libre doit donc poser CE
      // marqueur — poser `bienvenue: "fermee"` dans les prefs ne fait plus rien.
      if (sansBienvenue) sessionStorage.setItem("passio_first_run_bienvenue_fermee", "1");
    },
    [GATE_KEY, GATE_TOKEN, flagOn, opts.prefs || null, !!opts.sansBienvenue]
  );
  await page.goto("/index.html" + (opts.query || "") + (opts.hash || ""));
  await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined", null, { timeout: 20000 });
  await page.waitForTimeout(3200); // boot async + initApp + planification de l'accueil
  // Prémisse VÉRIFIÉE, jamais supposée : aucun vrai client Supabase n'a pu se
  // construire, donc aucune lecture ni écriture n'a atteint la production.
  const reel = await page.evaluate(() => window._supaReal);
  if (reel) throw new Error("prémisse cassée : un VRAI client Supabase s'est construit — le test mesurerait la production");
  return journalReseau;
}

// État local d'un compte déjà onboardé, pour le cas « utilisateur existant ».
function etatOnboarde() {
  return {
    onboarded: true, landingSeen: true, tourSeen: true,
    user: {
      name: "Compte existant", birthYear: 1990, isMinor: false,
      currentProfileId: "pp_0",
      profiles: [{ id: "pp_0", name: "Compte existant", passion: "musique", emoji: "🎸", bio: "", color: "#7c3aed", createdAt: 1 }],
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
      following: [], general: { username: "Compte existant" },
    },
    userPosts: [], userEvents: [], notifications: [],
    currentMood: "all", selectedFeedPassions: ["musique"],
  };
}

module.exports = { bootVisiteur, couperReseauSupabase, etatOnboarde, GATE_TOKEN, GATE_KEY };
