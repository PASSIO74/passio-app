// Lot UI-3A — passerelle « Trouver une expérience » du Feed vers l'IRL.
// ACTIVE PAR DÉFAUT depuis la validation visuelle de Benjamin du 2026-08-27.
//
// Ce que cette suite prouve, et rien d'autre :
//   ① l'URL NORMALE porte la passerelle, et rien n'est écrit dans localStorage
//      pour autant — l'activation vient du déploiement, pas de l'appareil ;
//   ② les deux kill switches (localStorage et mémoire) coupent l'aperçu ;
//   ③ une publication portant une Passio et SANS événement lié reçoit le lien,
//      et RIEN d'autre ; une publication reliée à un événement, non (UI-3B) ;
//   ④ le tap ouvre « Trouver une expérience » avec EXACTEMENT trois actions ;
//   ⑤ chacune des trois ouvre le moteur EXISTANT, sans rien créer ;
//   ⑥ la fermeture restitue la position exacte du Feed et l'identité active ;
//   ⑦ l'ancien CTA « Organiser un IRL » n'apparaît jamais en doublon ;
//   ⑧ mobile : 320 / 390 / 430 px sans débordement, cible tactile ≥ 44 px.
//   ⑨ la feuille a le MÊME habillage que la feuille « Créer » du (+) :
//      lavis violet, écriture violet foncé, icône à la place de l'emoji, et
//      AUCUN texte explicatif (demande de Benjamin du 2026-09-01).
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");
// Même sonde que `cases-violet-leger.spec.js` : la feuille de ce lot partage
// désormais la mise en forme de la feuille « Créer », donc les mêmes seuils.
const { sonde, verifierLavis } = require("./lavis-helper");

const PREVIEW = "?passio_preview=passio-ui-3";

// Marge de la restitution de position, en pixels. Elle absorbe l'arrondi de
// mise en page, pas un saut : un retour en tête du fil ferait des centaines de
// pixels d'écart.
const SEUIL_PX = 4;
const TAILLE_FIL = 9;
const DEFILEMENT_PX = 500;

// Position de la carte `id` DANS LA FENÊTRE. C'est la bonne mesure de « la
// position du Feed » : `#appMain.scrollTop` est réévalué en continu par
// Chromium à cause de `content-visibility: auto` sur `.post`, précisément pour
// garder le contenu visible immobile — le suivre reviendrait à mesurer la
// virtualisation du navigateur, pas ce que le testeur voit.
function hautCarte(page, id) {
  return page.evaluate((postId) => {
    const el = document.querySelector(`#feedList article.post[data-postid="${postId}"]`);
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  }, id);
}

function post(id, name, extra) {
  return Object.assign({
    id, authorId: "auteur_" + id, authorName: name, authorEmoji: "🎧",
    authorColor: "#7c3aed", passion: "musique", mood: "creation", type: "text",
    text: "Publication de " + name, createdAt: 9000 - id.length,
    likes: 0, comments: [],
  }, extra || {});
}

const POSTS = [
  post("v3_a", "Alice"),
  post("v3_bb", "Bruno"),
  post("v3_ccc", "Carla"),
];

// ── Démarrage APPLICATIF : deux courses à couper AVANT d'agir ──────────────
// `bootOnboarded` rend la main sur une DURÉE (2,5 s) et sur `#screen-feed.active`
// — classe déjà présente dans le HTML statique (index.html). Elle n'observe donc
// RIEN du démarrage réel. Or celui-ci est asynchrone de bout en bout :
//
//   ① `boot()` (app-08) attend le SDK Supabase puis `getSession()`, et sa ligne
//      `state = loadState()` REMPLACE l'objet d'état en bloc ; elle se termine
//      par `showLanding()`, qui remet l'écran d'accueil PAR-DESSUS l'app ;
//   ② `supaInit()` lance des chargements réseau dont les réponses REPEIGNENT :
//      `state.supabasePosts = initPosts; renderFeed();` (app-08, § « 1. CHARGER
//      LES POSTS ») et `supaLoadEvents().then(… renderIRL())` (§ « 3. Les autres
//      requêtes »), ce dernier UNIQUEMENT si l'écran IRL est visible.
//
// Sur une machine calme ces réponses arrivent bien avant la fin des 2,5 s ; sur
// un runner chargé, elles arrivent APRÈS le seed. Les deux échecs de CI de ce
// fichier viennent de là, et de rien d'autre — reproduits ici en simulant la
// seule chose qui manque en local (Supabase joignable) :
//   • le fil semé est remplacé par les posts de la base → la carte `v3_a` et son
//     lien disparaissent → « element(s) not found » sur `[data-v3-tempt]` ;
//   • le `renderIRL()` de la réponse « events » tombe pendant que l'écran IRL est
//     à l'écran → `requestUserLocation()` → `__geoCalls` vaut 1 au lieu de 0.
//
// ⚠️ Neutraliser ces chargements APRÈS `bootOnboarded` (ce que faisait ce
// fichier) ne suffit pas : une requête DÉJÀ EN VOL ignore le remplacement de la
// fonction.
//
// La seule barrière qu'AUCUNE course d'ordonnancement ne peut franchir est
// RÉSEAU : tant que la requête n'aboutit pas, peu importe qui l'a lancée et
// quand. On coupe donc Supabase pour cette suite — qui ne teste QUE du local
// (`app-helper` neutralise déjà toutes les écritures et se décrit lui-même comme
// « test offline »). Chaque chargeur traite cet échec par un `return []`
// (`supaLoadPosts` : `if (error) return []`), et l'application se garde ensuite
// elle-même : `if (initPosts.length > 0)` et `if (e && e.length)`. Résultat : ni
// remplacement du fil, ni `renderIRL()` surnuméraire — quelle que soit la charge.
//
// Le remplacement des fonctions reste posé EN PLUS : il couvre les chemins qui
// n'ont pas de requête à couper (SDK indisponible, stub inerte) et il documente
// l'intention. Il ne suffirait pas à lui seul — un `setInterval` posé au
// chargement du document peut être devancé par un timer ÉCHU depuis plus
// longtemps (celui qui lance `initApp`, donc `supaInit`) : mesuré ici, la
// fonction réelle était parfois déjà capturée. D'où la barrière réseau.
async function couperSupabase(page) {
  await page.route(/https?:\/\/[^/]*\.supabase\.co\//, (route) => route.abort());
}

// Remplace les chargeurs de démarrage dès qu'ils existent. Un `addInitScript`
// ne peut pas les poser d'emblée : ce sont des DÉCLARATIONS de fonction
// d'app-08, qui écrasent toute valeur posée avant l'analyse du fichier.
async function neutraliserChargementsDeDemarrage(page) {
  await page.addInitScript(() => {
    var NOMS = ["supaLoadPosts", "supaLoadEventPosts", "supaLoadEvents", "supaLoadStories"];
    var poser = function () {
      var tout = true;
      for (var i = 0; i < NOMS.length; i++) {
        var f = window[NOMS[i]];
        if (typeof f !== "function") { tout = false; continue; }
        if (f.__e2eNeutralise) continue;
        var vide = function () { return Promise.resolve([]); };
        vide.__e2eNeutralise = true;
        window[NOMS[i]] = vide;
      }
      return tout;
    };
    if (!poser()) {
      var iv = setInterval(function () { if (poser()) clearInterval(iv); }, 5);
      setTimeout(function () { clearInterval(iv); }, 30000); // jamais d'intervalle éternel
    }
  });
}

// Attend la CONDITION « le démarrage de l'application a réellement eu lieu » :
// l'état est chargé (donc `state = loadState()` ne viendra plus effacer le seed)
// et l'écran d'accueil ne recouvre pas l'app. Un `showLanding()` tardif est
// refermé — le helper le fait déjà une fois, on le refait tant qu'il revient,
// puis on exige que ce soit stable avant de rendre la main.
//
// Corollaire utile : le lancement d'`initApp()` (emoji-misc.js) est un timer
// armé à l'analyse du fichier, échu bien avant ces 2,5 s ; quand cette attente
// se résout, il a donc forcément déjà été servi — `renderEverything()` (et le
// `renderIRL()` qu'il contient) ne peut plus survenir pendant le test.
async function attendreDemarrageApplicatif(page) {
  await page.waitForFunction(() => {
    var s = null;
    try { s = state; } catch (e) { return false; } // liaison `let` pas encore initialisée
    if (!s || !s.user) return false;
    var l = document.getElementById("landing");
    if (l && l.classList.contains("active")) {
      l.classList.remove("active");
      window.__v3Boot = 0;
      return false;
    }
    window.__v3Boot = (window.__v3Boot || 0) + 1;
    return window.__v3Boot >= 3;
  }, null, { timeout: 30000, polling: 100 });
}

async function boot(page, opts = {}) {
  await couperSupabase(page);
  await neutraliserChargementsDeDemarrage(page);
  if (opts.killLocal) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_3", "0"));
  }
  if (opts.killMemoire) {
    await page.addInitScript(() => { window.PASSIO_UI_3 = false; });
  }
  // Coupure du lot qui RECOUVRE le comportement historique observé — ici UI-4A0
  // (tête de l'écran « Rencontrer », active par défaut depuis le 2026-08-28),
  // qui enveloppe `renderIRL` pour armer `_passioIrlSkipGeoOnce` avant chaque
  // rendu. Convention maison, déjà appliquée aux suites du pont historique face
  // à UI-3A : la suite qui observe le moteur historique pose le kill switch AU
  // BOOT et garde toutes ses assertions ; la cohabitation est prouvée à part.
  // (Couper UI-4A0 coupe aussi UI-4A1, qui en hérite — sans effet ici.)
  if (opts.killV4a0) {
    await page.addInitScript(() => localStorage.setItem("passio_ui_4a0", "0"));
  }
  // Chemin NOMINAL = l'URL normale, depuis la promotion du 2026-08-27. Seul le
  // test de compatibilité du lien d'aperçu demande explicitement `preview: true` :
  // faire l'inverse laisserait la promotion couverte par un seul cas, alors
  // qu'elle est désormais ce que voit tout le monde.
  await bootOnboarded(page, opts.errors, 1, opts.preview === true ? { query: PREVIEW } : {});

  // Filet tardif, conservé : il couvre les chemins qui rappelleraient ces
  // fonctions PLUS TARD (boucle de rafraîchissement du fil, retour en ligne).
  // La course du DÉMARRAGE, elle, est déjà coupée avant le boot ci-dessus — une
  // requête en vol se moque de ce remplacement.
  await page.evaluate(() => {
    window.supaLoadPosts = async () => [];
    window.supaLoadEventPosts = async () => [];
  });

  // …et on n'agit qu'une fois le démarrage applicatif RÉELLEMENT passé.
  await attendreDemarrageApplicatif(page);
}

// Peuple le fil de façon déterministe et capture la télémétrie émise.
// `passionsActives` borne le filtre du fil. Il vaut « musique » par défaut ;
// un test qui sème une publication portant une AUTRE passion doit l'ajouter ici,
// sinon le fil la filtre et la carte n'est jamais rendue.
async function seedFeed(page, posts, passionsActives) {
  await page.evaluate(([liste, passions]) => {
    window.__v3Tel = [];
    window.tel = window.tel || {};
    window.tel.action = function (name, meta) { window.__v3Tel.push({ name, meta }); };
    // L'aide contextuelle « auteur » est `position: fixed` : ouverte au-dessus du
    // fil, elle rendrait les taps non déterministes.
    state.hintsVus = state.hintsVus || {};
    state.hintsVus.feed_auteur = true;
    state.seed.posts = [];
    state.userPosts = [];
    state.supabasePosts = liste;
    state.user.profiles = [{ id: "pp_0", name: "Audit QA", passion: "musique", emoji: "🎵", color: "#7c3aed" }];
    _activeFeedPassions = new Set(passions);
    activeFeedIntent = "for_you";
    window._feedDomSig = null;
    renderFeed();
  }, [posts, passionsActives || ["musique"]]);
  // ⚠️ L'aide contextuelle « auteur » est `position: fixed` et INTERCEPTE les
  // taps. La marquer vue ne suffit pas : celle déclenchée par le `renderFeed`
  // du démarrage est déjà à l'écran quand ce helper s'exécute. On la ferme donc
  // explicitement — sinon un tap échoue en « subtree intercepts pointer events »,
  // au hasard de la charge du runner.
  await page.evaluate(() => {
    try { if (typeof fermerHint === "function") fermerHint(); } catch (e) {}
    document.querySelectorAll(".passio-hint").forEach((h) => h.remove());
  });
  // Attente DÉTERMINISTE de la décoration. Un délai fixe suffisait en local et
  // rendait la suite instable sur un runner CI chargé : on attend que le fil ait
  // cessé de bouger (nombre de cartes ET de traits stables sur plusieurs tours),
  // sinon Playwright tape dans une carte que `renderFeed` déplace encore.
  await page.waitForFunction((ids) => {
    const l = document.getElementById("feedList");
    if (!l) return false;
    // ⚠️ Le fil affiché doit être CELUI QU'ON A SEMÉ. Une réponse de démarrage
    // qui atterrit ici (`state.supabasePosts = initPosts` puis `renderFeed()`)
    // remplace le tableau en bloc : les cartes semées disparaissent, le lien avec
    // elles, et le test échouait quinze lignes plus loin sur un « element(s) not
    // found » qui ne disait pas d'où venait le problème. On l'observe DIRECTEMENT.
    // (Une publication semée peut être filtrée par sa passion — c'est voulu, cf.
    // `passionsActives` : on exige donc l'inclusion, pas l'égalité.)
    const rendus = Array.from(l.querySelectorAll("article.post[data-postid]"));
    if (!rendus.every((a) => ids.indexOf(a.getAttribute("data-postid")) !== -1)) {
      window.__v3Stable = 0;
      return false;
    }
    const traits = l.querySelectorAll("[data-v3-bridge]").length;
    // ⚠️ La stabilité seule ne suffit PAS : « 0 trait » est parfaitement stable
    // tant que la décoration n'a pas tourné. Le garde rendait donc la main sur
    // un fil non décoré, et l'assertion suivante échouait au hasard de la charge
    // (mesuré en CI). Quand l'aperçu est actif, on exige d'abord qu'un trait
    // soit posé — toutes les publications semées sous aperçu en ont au moins un.
    const actif = !!(window.PassioUIV3 && window.PassioUIV3.isEnabled());
    if (actif && traits === 0) { window.__v3Stable = 0; return false; }
    const sig = l.querySelectorAll("article.post").length + ":" + traits + ":" + l.scrollHeight;
    if (window.__v3Sig === sig) { window.__v3Stable = (window.__v3Stable || 0) + 1; }
    else { window.__v3Sig = sig; window.__v3Stable = 0; }
    return window.__v3Stable >= 4;
  }, posts.map((p) => p.id), { timeout: 15000, polling: 100 });
}

// Fait défiler le fil À UNE POSITION CHOISIE, puis renvoie l'identifiant du
// « Trouver une expérience » le plus proche du centre de l'écran.
//
// ⚠️ Pourquoi ne pas simplement faire `.nth(N).click()` : Playwright amène
// d'abord la cible dans la vue, puis exige qu'elle soit STABLE deux frames de
// suite. Or `.post` porte `content-visibility: auto` — les cartes hors écran ne
// sont pas mises en page, elles valent `contain-intrinsic-size: auto 320px`, et
// chaque carte qui entre dans la vue remplace son estimation par sa hauteur
// RÉELLE, ce qui décale tout ce qui suit. Défiler loin dans un fil long
// déclenche donc une cascade de re-mesures : sur le runner CI, à 1600 px dans
// 26 cartes, la boîte ne s'est jamais stabilisée — ni pour Playwright, ni pour
// le garde ci-dessous (15 s de timeout, vert en local sur une machine rapide).
//
// Le scénario était irréaliste, pas le produit : un utilisateur tape une carte
// qu'il VOIT, dans un fil posé. On défile donc modérément (§ TAILLE_FIL /
// DEFILEMENT_PX), on attend que la cible ait cessé de bouger, et on tape une
// cible DÉJÀ dans la vue — Playwright n'a plus rien à faire défiler.
async function taperCarteVisible(page, offset) {
  await page.evaluate((y) => { document.getElementById("appMain").scrollTop = y; }, offset);
  await page.waitForTimeout(400);
  const id = await page.evaluate(() => {
    const centre = window.innerHeight / 2;
    let best = null, dist = Infinity;
    document.querySelectorAll("#feedList [data-v3-tempt]").forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 80) return;
      const d = Math.abs((r.top + r.bottom) / 2 - centre);
      if (d < dist) { dist = d; best = b.getAttribute("data-v3-tempt"); }
    });
    return best;
  });
  expect(id, "un lien de passerelle doit être visible à cette position").toBeTruthy();

  // On attend que la cible ait cessé de bouger AVANT de taper. Playwright exige
  // deux frames identiques et abandonne au bout de 15 s ; sur un runner chargé,
  // la réévaluation des cartes `content-visibility` ne lui laissait pas toujours
  // cette fenêtre. On la lui donne explicitement.
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const t = Math.round(el.getBoundingClientRect().top);
    // Tolérance de 1 px : on veut détecter un fil qui BOUGE, pas l'arrondi
    // sous-pixel d'une mise en page par ailleurs posée.
    if (window.__v3Top != null && Math.abs(window.__v3Top - t) <= 1) {
      window.__v3TopN = (window.__v3TopN || 0) + 1;
    } else { window.__v3TopN = 0; }
    window.__v3Top = t;
    return window.__v3TopN >= 3;
  }, `[data-v3-tempt="${id}"]`, { timeout: 15000, polling: 100 });

  await page.locator(`[data-v3-tempt="${id}"]`).click();
  return id;
}

// Tape un lien de passerelle DÉSIGNÉ (une carte précise), en lui appliquant la
// même précaution que ci-dessus : on l'amène dans la vue, puis on attend qu'il
// ait cessé de bouger avant de taper. Motif identique, raison identique — les
// `.post` portent `content-visibility: auto` et chaque carte qui entre dans la
// vue remplace son estimation de hauteur par sa hauteur RÉELLE, ce qui décale
// tout ce qui suit ; Playwright, qui exige deux frames stables et abandonne au
// bout de 15 s, tombait au hasard de la charge du runner (instabilité observée
// sur les taps directs de cette suite). Rien n'est affaibli : ce que ces tests
// examinent, c'est ce qui se passe APRÈS le tap.
// ⚠️ `.first()` et `document.querySelector` désignent la MÊME cible (le premier
// nœud correspondant) : un sélecteur qui en vise plusieurs reste utilisable sans
// violer le mode strict de Playwright, et l'attente porte bien sur ce qui sera
// tapé.
async function taperLien(page, selecteur) {
  const lien = page.locator(selecteur).first();
  await expect(lien).toBeVisible();
  await lien.scrollIntoViewIfNeeded();
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const t = Math.round(el.getBoundingClientRect().top);
    if (window.__v3TopL != null && Math.abs(window.__v3TopL - t) <= 1) {
      window.__v3TopLN = (window.__v3TopLN || 0) + 1;
    } else { window.__v3TopLN = 0; }
    window.__v3TopL = t;
    return window.__v3TopLN >= 3;
  }, selecteur, { timeout: 15000, polling: 100 });
  await lien.click();
}

// ── ① PROMOTION : l'URL normale PORTE la passerelle ────────────────────────
// Ce test était l'inverse jusqu'au 2026-08-27 (« aucun trait, aucun lien ») :
// le lot vivait en aperçu. La validation visuelle de Benjamin l'a promu ; le
// test change donc de sens, pas de rôle — c'est toujours lui qui dit ce que
// voit un utilisateur qui ouvre PASSIO normalement.
test("URL normale : la passerelle est là, et rien n'est écrit pour autant", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(3);
  await expect(page.locator("#feedList [data-v3-tempt]").first()).toBeVisible();
  await expect(page.locator("#feedList [data-v3-tempt]").first()).toHaveText("Trouver une activité");
  expect(await page.evaluate(() => document.documentElement.classList.contains("passio-ui-3"))).toBe(true);
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(true);

  // ⚠️ L'invariant qui SURVIT à la promotion, et qui compte le plus : activer le
  // lot n'a jamais rien posé sur l'appareil. Le drapeau ne sait que retirer.
  expect(await page.evaluate(() => localStorage.getItem("passio_ui_3"))).toBeNull();
  expect(await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /ui_?3|ui-3/i.test(k)))).toEqual([]);

  // Les acquis UI-1 + UI-2 restent intacts sur cette même URL.
  await expect(page.locator("#appNavV2")).toBeVisible();
  await expect(page.locator("#feedIntentSelector")).toBeVisible();

  expect(errors.js, "exceptions JS sur l'URL normale").toEqual([]);
  expect(errors.console.filter((m) => m.includes("[ui-v3]"))).toEqual([]);
});

test("lien d'aperçu : toujours valide, et toujours sans écriture d'activation", async ({ page }) => {
  await boot(page, { preview: true });
  await seedFeed(page, POSTS);
  await expect(page.locator("#feedList [data-v3-tempt]").first()).toBeVisible();

  // Ni la clé du lot, ni aucune autre clé qui rendrait l'aperçu « collant ».
  expect(await page.evaluate(() => localStorage.getItem("passio_ui_3"))).toBeNull();
  expect(await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /ui_?3|ui-3/i.test(k)))).toEqual([]);
});

// ── ② Kill switches ────────────────────────────────────────────────────────
test("kill switch localStorage : coupe sur l'URL normale ET malgré le lien d'aperçu", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { killLocal: true, errors });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(false);
  expect(errors.js).toEqual([]);
});

// Le lien d'aperçu ne doit JAMAIS court-circuiter une coupure : c'est ce qui
// distingue un kill switch d'une simple préférence. Depuis la promotion, le
// paramètre n'entre même plus dans `uiV3Enabled()` — ce test le verrouille.
test("kill switch localStorage : le lien d'aperçu ne le court-circuite pas", async ({ page }) => {
  await boot(page, { killLocal: true, preview: true });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(false);
});

test("kill switch mémoire : window.PASSIO_UI_3 = false coupe l'aperçu", async ({ page }) => {
  await boot(page, { killMemoire: true });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(false);

  // …et une coupure décidée en cours de session retire ce qui était déjà posé.
  await page.evaluate(() => { window.PASSIO_UI_3 = undefined; window.PassioUIV3.apply(); });
  await page.waitForTimeout(150);
  await expect(page.locator("#feedList [data-v3-bridge]").first()).toBeVisible();
  await page.evaluate(() => { window.PASSIO_UI_3 = false; window.PassioUIV3.apply(); });
  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(0);
});

// ── ③ Éligibilité ──────────────────────────────────────────────────────────
test("le lien n'apparaît que sur les publications éligibles, et SEUL", async ({ page }) => {
  await boot(page);
  await seedFeed(page, [
    post("v3_ok", "Alice"),                                       // éligible
    post("v3_evt", "Bruno", { eventId: "e_42" }),                  // déjà relié → UI-3B
    post("v3_share", "Carla", { sharedReelData: { kind: "event", id: "e_7" } }),
    post("v3_nopsn", "Diane", { passion: "passion_inexistante" }), // Passio inconnue
  ]);

  await expect(page.locator("#feedList [data-v3-bridge]")).toHaveCount(1);
  const carte = page.locator('article.post[data-postid="v3_ok"]');
  await expect(carte.locator("[data-v3-tempt]")).toHaveText("Trouver une activité");

  // Contrat visuel arrêté le 2026-08-27 après essai réel sur la preview : la
  // ligne basse ne porte QUE le lien. Le nom de la Passio, son emoji et le trait
  // violet/corail sont supprimés — la Passio figure déjà dans l'en-tête du post.
  const ligne = carte.locator("[data-v3-bridge]");
  await expect(ligne.locator(".v3-bridge-passion")).toHaveCount(0);
  await expect(ligne.locator(".v3-bridge-emoji")).toHaveCount(0);
  await expect(ligne.locator(".v3-bridge-label")).toHaveCount(0);
  await expect(ligne.locator(".v3-bridge-trace")).toHaveCount(0);
  // Un seul élément dans la ligne, et c'est le lien.
  expect(await ligne.evaluate((el) => el.children.length)).toBe(1);
  expect(await ligne.evaluate((el) => el.firstElementChild.className)).toContain("v3-tempt");
  // Le libellé de la Passio n'apparaît nulle part dans cette ligne.
  expect(await ligne.innerText()).toBe("Trouver une activité");

  await expect(page.locator('article.post[data-postid="v3_evt"] [data-v3-bridge]')).toHaveCount(0);
  await expect(page.locator('article.post[data-postid="v3_share"] [data-v3-bridge]')).toHaveCount(0);
  await expect(page.locator('article.post[data-postid="v3_nopsn"] [data-v3-bridge]')).toHaveCount(0);
});

// L'aperçu ne tient QUE par `?passio_preview=…` dans l'URL, et `goTo` fait
// `history.pushState(..., "#" + ecran)` à chaque navigation. Si cet appel
// perdait la chaîne de requête, la passerelle disparaîtrait au premier
// aller-retour — sans erreur, sans trace. Ce test l'exerce pour de vrai.
test("la passerelle survit à un aller-retour entre écrans", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);
  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(3);

  await page.evaluate(() => goTo("irl"));
  await expect(page.locator("#screen-irl")).toHaveClass(/active/);
  await page.evaluate(() => goTo("feed"));
  await expect(page.locator("#screen-feed")).toHaveClass(/active/);

  // Le drapeau se relit à CHAQUE rendu : s'il ne trouvait plus le paramètre,
  // le fil reviendrait nu.
  expect(await page.evaluate(() => window.PassioUIV3.isEnabled())).toBe(true);
  await expect(page.locator("#feedList [data-v3-tempt]").first()).toBeVisible();

  // …et le parcours reste complet après l'aller-retour.
  await taperLien(page, "#feedList [data-v3-tempt]");
  await expect(page.locator("#v3PassioSheet")).toBeVisible();
  await expect(page.locator("#v3PassioSheet [data-v3-choice]")).toHaveCount(3);
});

// ── ④ Le panneau et ses trois actions ──────────────────────────────────────
test("le tap ouvre « Trouver une expérience » avec exactement trois actions", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  const sheet = page.locator("#v3PassioSheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("#v3SheetTitle")).toHaveText("Trouver une expérience");
  expect(await sheet.locator("[data-v3-choice] .v2-sheet-item-title").allTextContents()).toEqual([
    "Voir les activités", "Découvrir des personnes", "Proposer une sortie",
  ]);

  // Rôle de dialogue, état exposé au lecteur d'écran, focus entré dans la feuille.
  await expect(sheet.locator('[role="dialog"]')).toHaveAttribute("aria-modal", "true");
  await expect(page.locator('[data-v3-tempt="v3_a"]')).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() =>
    !!document.activeElement.closest("#v3PassioSheet"))).toBe(true);

  // Télémétrie : ouverture tracée, sans texte libre ni identifiant de personne.
  const tel = await page.evaluate(() => window.__v3Tel);
  const ouverture = tel.find((e) => e.name === "ui_v3_tempt_open");
  expect(ouverture).toBeTruthy();
  expect(Object.keys(ouverture.meta).sort()).toEqual(["has_psn", "has_ref", "v"]);
});

// ── ⑨ Le même habillage que la feuille « Créer » du (+) ─────────────────────
// Demande de Benjamin du 2026-09-01, après essai réel : « dans le fil quand je
// clique sur un post → Trouver une expérience, je veux les mêmes onglets que
// dans (+), même design fond violet clair écriture violet foncé ; supprime les
// textes explicatifs et les emojis. »
//
// ⚠️ Ce test regarde ce qui est PEINT, jamais la feuille de style : les règles
// des deux feuilles sont groupées dans styles.css, et c'est exactement le genre
// de groupement qu'une retouche ultérieure peut défaire sans le vouloir. Il
// mesure donc la couleur calculée, comme `cases-violet-leger.spec.js`.
test("la feuille porte l'habillage du (+) : lavis violet, icône, aucun texte explicatif", async ({ page }) => {
  const errors = { js: [], console: [], network: [] };
  await boot(page, { errors });
  await seedFeed(page, POSTS);

  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  const sheet = page.locator("#v3PassioSheet");
  await expect(sheet).toBeVisible();

  // ① Plus d'emoji, plus d'aide : les libellés portent seuls.
  await expect(sheet.locator(".v2-sheet-emoji")).toHaveCount(0);
  await expect(sheet.locator(".v2-sheet-item-hint")).toHaveCount(0);
  // Et rien ne les a remplacés par du texte ailleurs dans la case : chaque
  // entrée ne dit QUE son libellé.
  expect((await sheet.locator("[data-v3-choice]").allInnerTexts()).map((t) => t.trim()))
    .toEqual(["Voir les activités", "Découvrir des personnes", "Proposer une sortie"]);

  // ② Une icône SVG par entrée, dans la pastille du (+) — pas un caractère.
  await expect(sheet.locator("[data-v3-choice] .v2-sheet-icon svg")).toHaveCount(3);

  // ③ Le lavis : fond clair, écriture violet foncé, contraste AA. Mesuré sur
  //    la case ET sur son titre, comme pour la feuille « Créer ».
  const item = sheet.locator('[data-v3-choice="activities"]');
  verifierLavis(await item.evaluate(sonde), "case « Voir les activités »");
  verifierLavis(
    await item.locator(".v2-sheet-item-title").evaluate(sonde),
    "titre « Voir les activités »",
  );

  // ④ Le libellé est CENTRÉ dans sa case, comme dans le (+) : c'est ce que le
  //    conteneur `.v2-sheet-text` porte, et il ne doit pas être resté aligné à
  //    gauche par la règle générique des feuilles basses.
  expect(await item.locator(".v2-sheet-text").evaluate((el) => getComputedStyle(el).textAlign))
    .toBe("center");

  expect(errors.js, "exceptions JS").toEqual([]);
});

test("Escape ferme le panneau et rien n'a été créé", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  const avant = await page.evaluate(() => ({
    events: (state.userEvents || []).length,
    joined: (state.user.joinedEvents || []).length,
    convs: Object.keys(window.conversations || {}).length,
    follows: (state.user.following || []).length,
  }));

  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  await expect(page.locator("#v3PassioSheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#v3PassioSheet")).toBeHidden();
  await expect(page.locator('[data-v3-tempt="v3_a"]')).toHaveAttribute("aria-expanded", "false");

  expect(await page.evaluate(() => ({
    events: (state.userEvents || []).length,
    joined: (state.user.joinedEvents || []).length,
    convs: Object.keys(window.conversations || {}).length,
    follows: (state.user.following || []).length,
  }))).toEqual(avant);
});

// ── ⑤ Les trois suites ouvrent les moteurs EXISTANTS ───────────────────────
// Sonde de géolocalisation posée AVANT tout clic : si un appel partait, elle le
// verrait. UI-3A ne doit jamais en émettre un.
async function sondeGeo(page) {
  await page.evaluate(() => {
    window.__geoCalls = 0;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = function () { window.__geoCalls++; };
    }
  });
}

test("« Voir les activités » ouvre l'IRL filtré sur la Passio, sans GPS demandé", async ({ page }) => {
  await boot(page);
  await sondeGeo(page);
  await seedFeed(page, POSTS);

  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  await page.locator('[data-v3-choice="activities"]').click();

  await expect(page.locator("#v3PassioSheet")).toBeHidden();
  await expect(page.locator("#screen-irl")).toHaveClass(/active/);
  // Le filtre EXISTANT porte la Passio, et elle seule.
  expect(await page.evaluate(() => Array.from(irlPassionFilters))).toEqual(["musique"]);
  // …et la tuile correspondante est bien active dans la rangée EXISTANTE. La
  // tête UI-4A0 s'ajoute AU-DESSUS de l'écran historique sans le remplacer :
  // `#irlPassionRow` est toujours là, et c'est toujours lui que le moteur
  // (`renderIrlPassionTiles`) marque.
  await expect(page.locator('#irlPassionRow [data-irlpassion="musique"]')).toHaveClass(/active/);
  // Aucune activité, aucun RSVP créés par le passage.
  expect(await page.evaluate(() => (state.userEvents || []).length)).toBe(0);
  expect(await page.evaluate(() => (state.user.joinedEvents || []).length)).toBe(0);
  // L'INVARIANT du lot, intact : arriver par « Voir les activités » ne demande
  // jamais la position.
  expect(await page.evaluate(() => window.__geoCalls)).toBe(0);

  // ⚠️ Réécrit le 2026-08-28, jour où UI-4A0 (tête de l'écran « Rencontrer »)
  // est passé en ACTIF PAR DÉFAUT. Ce test affirmait ici que le rendu SUIVANT de
  // l'écran IRL redemandait la position : c'était vrai tant que `renderIRL`
  // était le moteur historique NU. UI-4A0 l'enveloppe désormais pour armer le
  // MÊME marqueur `_passioIrlSkipGeoOnce` avant CHAQUE rendu — sur l'URL
  // normale, plus aucun rendu de cet écran n'émet de demande. L'ancien énoncé
  // est devenu faux par changement de PRODUIT, pas par régression d'UI-3A ; son
  // énoncé d'origine est reconduit tel quel dans le test suivant, qui coupe
  // UI-4A0 au boot pour observer le moteur historique seul.
  //
  // Ce que l'on verrouille ici, sur la configuration RÉELLE : le marqueur est
  // toujours CONSOMMÉ (jamais laissé armé), un rendu de plus reste silencieux,
  // et ce silence n'est pas un GPS éteint — le geste explicite le redemande
  // immédiatement.
  expect(await page.evaluate(() => window._passioIrlSkipGeoOnce)).toBe(false);
  await page.evaluate(() => renderIRL());
  expect(await page.evaluate(() => window.__geoCalls),
    "UI-4A0 actif : aucun rendu de l'écran IRL ne demande la position").toBe(0);
  expect(await page.evaluate(() => window._passioIrlSkipGeoOnce)).toBe(false);

  await page.evaluate(() => requestUserLocation());
  expect(await page.evaluate(() => window.__geoCalls),
    "un geste explicite redemande la position : rien n'est durablement éteint").toBe(1);
});

// Le pendant du précédent, dans la configuration où le comportement historique
// est observable : UI-4A0 coupé au boot. L'énoncé est EXACTEMENT celui d'avant
// la promotion — la suppression est à usage unique, le geste suivant SUR l'écran
// IRL redemande la position — et il prouve toujours la même chose : le marqueur
// posé par UI-3A ne peut pas couper durablement la géolocalisation de l'app.
test("UI-4A0 coupé : le marqueur d'UI-3A reste à USAGE UNIQUE", async ({ page }) => {
  await boot(page, { killV4a0: true });
  await sondeGeo(page);
  await seedFeed(page, POSTS);

  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  await page.locator('[data-v3-choice="activities"]').click();

  await expect(page.locator("#screen-irl")).toHaveClass(/active/);
  expect(await page.evaluate(() => Array.from(irlPassionFilters))).toEqual(["musique"]);
  // Prémisse : la tête n'est pas là, c'est bien le moteur historique que l'on
  // observe — sans quoi ce test dirait la même chose que le précédent.
  expect(await page.evaluate(() => !!document.getElementById("v4a0Head"))).toBe(false);

  // UI-4A0 hors circuit, ce zéro n'est plus dû qu'au marqueur d'UI-3A : c'est ici
  // — et ici seulement — que l'invariant du lot est prouvé SANS filet.
  expect(await page.evaluate(() => window.__geoCalls),
    "UI-3A seul : la passerelle n'émet aucune demande de position").toBe(0);
  expect(await page.evaluate(() => window._passioIrlSkipGeoOnce)).toBe(false);
  await page.evaluate(() => renderIRL());
  expect(await page.evaluate(() => window.__geoCalls),
    "le geste suivant SUR l'écran IRL redemande la position, normalement").toBe(1);
});

test("« Découvrir des personnes » ouvre le parcours Passion, sans contact automatique", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  const suivisAvant = await page.evaluate(() => (state.user.following || []).length);

  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  await page.locator('[data-v3-choice="people"]').click();

  await expect(page.locator("#v3PassioSheet")).toBeHidden();
  const modal = page.locator("#modalBackdrop");
  await expect(modal).toHaveClass(/active/);
  await expect(modal.locator(".modal-title")).toHaveText("Musique");
  await expect(modal.locator(".section-title").first()).toHaveText("Créateurs");

  // Aucun abonnement, aucune conversation ouverte d'office.
  expect(await page.evaluate(() => (state.user.following || []).length)).toBe(suivisAvant);
  await expect(page.locator("#screen-messages")).not.toHaveClass(/active/);
});

test("« Proposer une sortie » préremplit le formulaire IRL existant sans rien créer", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  await page.locator('[data-v3-choice="propose"]').click();

  await expect(page.locator("#v3PassioSheet")).toBeHidden();
  await expect(page.locator("#modalBackdrop")).toHaveClass(/active/);
  // Le formulaire EXISTANT, prérempli par le moteur EXISTANT.
  await expect(page.locator("#evPassion")).toHaveValue("musique");
  expect(await page.evaluate(() =>
    document.getElementById("modalContent").getAttribute("data-feed-irl-source"))).toBe("v3_a");
  // Rien n'est soumis : aucun événement créé tant que le testeur n'a pas validé.
  expect(await page.evaluate(() => (state.userEvents || []).length)).toBe(0);
});

// ── ⑥ Retour au Feed : position exacte et identité active ──────────────────
test("fermer le panneau restitue la position du Feed et l'identité active", async ({ page }) => {
  await boot(page);
  // TAILLE_FIL = 9 : assez pour défiler réellement, et sous le seuil de peinture
  // rapide de `renderFeed` (12), donc SANS complément en idle qui rallongerait le
  // fil après coup. DEFILEMENT_PX = 500 : franchement au-dessus de zéro, et assez
  // proche du haut pour que seules deux ou trois cartes aient à se mesurer — le
  // fil se pose alors en quelques centaines de millisecondes, même sur un runner
  // chargé (cf. la note de `taperCarteVisible`).
  const beaucoup = [];
  for (let i = 0; i < TAILLE_FIL; i++) beaucoup.push(post("v3_s" + "x".repeat(i), "Auteur " + i));
  await seedFeed(page, beaucoup);

  const identiteAvant = await page.evaluate(() => state.user.currentProfileId);

  // On défile PROFONDÉMENT dans le fil, puis on tape une carte déjà visible. La
  // position réelle au moment de l'ouverture n'est donc pas le haut du fil :
  // c'est CELLE-LÀ que la fermeture doit rendre.
  // Les trois fermetures possibles doivent toutes rendre la même chose : la
  // carte tapée, au même endroit de l'écran, sur le Feed, sans changer d'identité.
  const fermetures = [
    ["le « × » du panneau", () => page.locator("#v3PassioSheet [data-v3-close]").click()],
    ["Escape", () => page.keyboard.press("Escape")],
    ["un tap hors panneau", () => page.locator("#v3PassioSheet").click({ position: { x: 5, y: 5 } })],
  ];

  for (const [nom, fermer] of fermetures) {
    const id = await taperCarteVisible(page, DEFILEMENT_PX);
    await expect(page.locator("#v3PassioSheet")).toBeVisible();
    const avant = await hautCarte(page, id);
    // Le fil a réellement défilé : la carte tapée n'est pas la première du fil.
    expect(await page.evaluate(() => document.getElementById("appMain").scrollTop),
      "le fil doit réellement avoir défilé").toBeGreaterThan(100);

    await fermer();
    await expect(page.locator("#v3PassioSheet")).toBeHidden();

    const apres = await hautCarte(page, id);
    expect(Math.abs(apres - avant), `fermeture par ${nom}`).toBeLessThanOrEqual(SEUIL_PX);
    // …et on est toujours sur le Feed, avec la même identité active.
    await expect(page.locator("#screen-feed")).toHaveClass(/active/);
    expect(await page.evaluate(() => state.user.currentProfileId)).toBe(identiteAvant);
  }
});

// ── ⑦ Aucun doublon avec l'ancien CTA ──────────────────────────────────────
test("l'ancien CTA « Organiser un IRL » ne coexiste jamais avec la passerelle", async ({ page }) => {
  await boot(page);
  // Le pont historique est explicitement rallumé : c'est le cas où le doublon
  // pourrait apparaître.
  await page.evaluate(() => { window.PASSIO_FEED_IRL_BRIDGE_V1 = true; });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(3);
  // Le CTA historique est bien RENDU par le moteur (le pont est allumé)…
  await expect(page.locator("#feedList .feed-irl-bridge")).toHaveCount(3);
  // …mais aucun n'est visible, et son libellé n'apparaît nulle part.
  await expect(page.locator("#feedList .feed-irl-bridge").first()).toBeHidden();
  expect(await page.locator("#feedList").innerText()).not.toContain("Organiser un IRL");
});

// Le pendant du test précédent : couper UI-3A doit RENDRE le CTA historique.
// Le masquer par CSS plutôt que le retirer du DOM est ce qui garantit ce retour ;
// l'implémentation initiale le détruisait et la carte se retrouvait sans aucune
// porte vers l'IRL après coupure (défaut relevé en contre-revue).
test("couper UI-3A restitue le CTA historique, sans repeindre le fil", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.PASSIO_FEED_IRL_BRIDGE_V1 = true; });
  await seedFeed(page, POSTS);

  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(3);
  await expect(page.locator("#feedList .feed-irl-bridge").first()).toBeHidden();

  // Coupure en mémoire, SANS toucher au fil : aucun renderFeed n'est appelé.
  await page.evaluate(() => { window.PASSIO_UI_3 = false; window.PassioUIV3.apply(); });

  await expect(page.locator("#feedList [data-v3-tempt]")).toHaveCount(0);
  await expect(page.locator("#feedList .feed-irl-bridge").first()).toBeVisible();
  expect(await page.locator("#feedList").innerText()).toContain("Organiser un IRL");
});

// ⑦ ter. Le masquage du CTA historique est BORNÉ aux cartes que la passerelle
// décore vraiment. Les deux éligibilités ne se recouvrent pas : le pont
// historique s'affiche sur tout post non événementiel, la passerelle exige en
// plus une passion CONNUE. Une règle non bornée fermait donc la seule porte vers
// l'IRL des cartes sans passion reconnue, sans rien mettre à la place.
test("une carte non décorée garde son CTA historique, passerelle active", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.PASSIO_FEED_IRL_BRIDGE_V1 = true; });
  // `passion_inconnue_qa` n'existe dans aucun catalogue : la passerelle ne peut
  // pas décorer cette carte, le pont historique le peut.
  await seedFeed(
    page,
    POSTS.concat([post("v3_sans", "Dana", { passion: "passion_inconnue_qa" })]),
    ["musique", "passion_inconnue_qa"], // sans quoi le fil filtre la carte
  );

  const sans = '#feedList .post[data-postid="v3_sans"]';
  await expect(page.locator(`${sans} [data-v3-tempt]`)).toHaveCount(0);
  await expect(page.locator(sans)).not.toHaveAttribute("data-v3-decore", "1");
  // La porte vers l'IRL de cette carte reste OUVERTE.
  await expect(page.locator(`${sans} .feed-irl-bridge`)).toBeVisible();

  // Et sur une carte décorée, le masquage s'applique toujours.
  await expect(page.locator('#feedList .post[data-postid="v3_a"] [data-v3-tempt]')).toHaveCount(1);
  await expect(page.locator('#feedList .post[data-postid="v3_a"] .feed-irl-bridge')).toBeHidden();
});

// ── ⑦ bis. L'aide contextuelle ne doit pas barrer la route ─────────────────
// Le harnais de cette suite ferme les aides pour rendre les taps déterministes.
// Ce test fait l'INVERSE : il en affiche une pour de vrai, et prouve que le
// parcours reste atteignable — sinon le confort du test masquerait un défaut
// produit (une bulle `position: fixed` qui intercepte le tap).
test("une aide contextuelle VISIBLE n'empêche pas la passerelle", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  // On affiche réellement l'aide « auteur », ancrée sur la première carte.
  const affichee = await page.evaluate(() => {
    state.hintsVus = {};
    return montrerHint("feed_auteur", "#feedList .post .post-author");
  });
  expect(affichee, "l'aide doit réellement s'être affichée").toBe(true);
  const bulle = page.locator('.passio-hint[data-hint="feed_auteur"]');
  await expect(bulle).toBeVisible();

  // Le parcours reste atteignable, aide affichée.
  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  await expect(page.locator("#v3PassioSheet")).toBeVisible();
  // …et l'aide a été fermée proprement, pas recouverte : aucune bulle orpheline
  // ne flotte au-dessus de la feuille.
  await expect(bulle).toHaveCount(0);

  await expect(page.locator("#v3PassioSheet [data-v3-choice]")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator("#v3PassioSheet")).toBeHidden();
});

// ── ⑦ ter. Accessibilité : le corail doit rester LISIBLE ───────────────────
// Le corail de marque #ff6b57 ne donne que 2,80:1 sur blanc — sous le 4,5:1 de
// WCAG AA pour du texte normal, et même sous le 3:1 des grands caractères (le
// lien fait 13 px). Ce test calcule le ratio RÉEL depuis les styles appliqués
// par le navigateur : une régression de jeton, de fond ou de couleur sera vue.
test("la pastille « Trouver une activité » respecte le contraste AA (4,5:1)", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);

  const mesure = await page.evaluate(() => {
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    // Fond EFFECTIF : on remonte les ancêtres jusqu'au premier fond opaque,
    // sinon on mesurerait contre un `transparent` qui ne veut rien dire.
    const fond = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const v = parse(bg);
        if (v.length === 3 && !/rgba\(.*,\s*0\)/.test(bg)) return v;
      }
      return [255, 255, 255];
    };
    const cible = document.querySelector("#feedList [data-v3-tempt]");
    const st = getComputedStyle(cible);
    const c = lum(parse(st.color)), f = lum(fond(cible));
    const hi = Math.max(c, f), lo = Math.min(c, f);
    return {
      ratio: (hi + 0.05) / (lo + 0.05),
      couleur: st.color,
      taillePx: parseFloat(st.fontSize),
      graisse: st.fontWeight,
    };
  });

  // 13 px, même en graisse 800, relève du « texte normal » : le seuil des grands
  // caractères (3:1) ne s'applique qu'à partir de 18,66 px en gras.
  expect(mesure.taillePx, "un lien plus grand changerait le seuil applicable").toBeLessThan(18.66);
  expect(mesure.ratio, `contraste réel de ${mesure.couleur} : ${mesure.ratio.toFixed(2)}:1`)
    .toBeGreaterThanOrEqual(4.5);
});

// ── ⑦ quater. Mouvement : `prefers-reduced-motion` doit être respecté ──────
// L'ordre du lot autorise UNE transition courte à l'ouverture du panneau, et
// exige de respecter `prefers-reduced-motion`. Ce test l'exerce dans les deux
// réglages : l'animation existe par défaut, et elle disparaît quand l'utilisateur
// a demandé moins de mouvement — sans que le panneau cesse pour autant de
// s'ouvrir et de fonctionner.
test("aucune animation quand l'utilisateur demande moins de mouvement", async ({ page }) => {
  await boot(page);
  // ⚠️ `page.emulateMedia` et non `test.use({ reducedMotion })` : mesuré ici, la
  // seconde forme ne parvenait pas jusqu'à la page (`matchMedia(...)` restait à
  // `false`) et le test aurait alors constaté « pas de réduction » sur un
  // navigateur qui n'avait rien demandé — un vert qui ne prouve rien. L'appel
  // explicite, lui, est vérifiable dans la ligne d'assertion ci-dessous.
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    "prémisse : le réglage doit réellement atteindre la page").toBe(true);

  await seedFeed(page, POSTS);
  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  await expect(page.locator("#v3PassioSheet")).toBeVisible();

  const m = await page.evaluate(() => {
    const st = getComputedStyle(document.querySelector("#v3PassioSheet .v3-sheet-trace"));
    return { duree: parseFloat(st.transitionDuration), transform: st.transform };
  });
  expect(m.duree, "aucune transition sur le trait").toBe(0);
  // Le trait doit être ENTIÈREMENT déployé, pas figé à scaleX(0) : couper
  // l'animation ne doit pas couper l'élément qu'elle animait.
  expect(m.transform, "le trait reste déployé (identité, pas scaleX(0))")
    .toBe("matrix(1, 0, 0, 1, 0, 0)");

  // Le panneau reste pleinement utilisable.
  await expect(page.locator("#v3PassioSheet [data-v3-choice]")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator("#v3PassioSheet")).toBeHidden();
});

// Le pendant : sans réglage particulier, la transition courte EXISTE bien.
test("la transition d'ouverture existe par défaut", async ({ page }) => {
  await boot(page);
  await seedFeed(page, POSTS);
  await taperLien(page, 'article.post[data-postid="v3_a"] [data-v3-tempt]');
  await expect(page.locator("#v3PassioSheet")).toBeVisible();

  const duree = await page.evaluate(() => {
    const st = getComputedStyle(document.querySelector("#v3PassioSheet .v3-sheet-trace"));
    return parseFloat(st.transitionDuration);
  });
  expect(duree, "une transition, et courte").toBeGreaterThan(0);
  expect(duree, "pas plus de 400 ms : « transitions courtes et tactiles »").toBeLessThanOrEqual(0.4);
});

// ── ⑧ Mobile ───────────────────────────────────────────────────────────────
for (const largeur of [320, 390, 430]) {
  test(`aperçu : aucun débordement et cible tactile ≥ 44 px en ${largeur} px`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 });
    await boot(page);
    await seedFeed(page, POSTS);

    const cta = page.locator("#feedList [data-v3-tempt]").first();
    await expect(cta).toBeVisible();
    const boite = await cta.boundingBox();
    expect(boite.height).toBeGreaterThanOrEqual(44);

    // La carte ne déborde pas, et la page ne défile pas horizontalement.
    const debord = await page.evaluate(() => {
      const doc = document.documentElement;
      const row = document.querySelector("#feedList .v3-bridge");
      const carte = row.closest("article.post");
      return {
        page: doc.scrollWidth - doc.clientWidth,
        ligne: Math.round(row.getBoundingClientRect().right - carte.getBoundingClientRect().right),
      };
    });
    expect(debord.page).toBeLessThanOrEqual(0);
    expect(debord.ligne).toBeLessThanOrEqual(0);

    // Panneau ouvert : les trois actions restent dans l'écran et ≥ 44 px.
    await taperLien(page, "#feedList [data-v3-tempt]");
    await expect(page.locator("#v3PassioSheet")).toBeVisible();
    const items = await page.locator("#v3PassioSheet [data-v3-choice]").all();
    expect(items.length).toBe(3);
    for (const it of items) {
      const b = await it.boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(Math.round(b.x + b.width)).toBeLessThanOrEqual(largeur);
    }
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
